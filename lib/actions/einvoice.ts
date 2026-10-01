"use server";

/**
 * Server actions for e-Invoice (IRN) / e-Way Bill generation via
 * WhiteBooks, our GST Suvidha Provider.
 *
 * Failures persist the IRP's own message onto the sale (einvoiceError /
 * ewbError) before throwing, because Next.js redacts thrown Server Action
 * errors in production — the row's status column is the reliable channel,
 * not the caught message. See the push buttons in components/einvoice/.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { getSaleById } from "@/lib/queries/sales";
import { isWithinReportingWindow } from "@/lib/queries/einvoice";
import { requireNonDealer } from "@/lib/actions/auth";
import { getSettings } from "@/lib/settings";
import { isValidGstin } from "@/lib/gst";
import { getWhitebooksConfig } from "@/lib/whitebooks/config";
import {
  cancelEwb as wbCancelEwb,
  cancelIrn as wbCancelIrn,
  generateEwbByIrn as wbGenerateEwbByIrn,
  generateIrn as wbGenerateIrn,
  getEwaybillDetailsByIrn as wbGetEwaybillDetailsByIrn,
  getIrnByDocDetails as wbGetIrnByDocDetails,
  getIrnDetails as wbGetIrnDetails,
  WhitebooksError,
} from "@/lib/whitebooks/client";
import {
  buildIrnPayload,
  type IrnDispatch,
  type IrnSale,
  type IrnSeller,
} from "@/lib/whitebooks/irn-payload";

type LoadedSale = NonNullable<Awaited<ReturnType<typeof getSaleById>>>;

/** Any active sale with a customer on file — GSTIN not required, since an
 *  e-way bill applies to goods movement regardless of the buyer's GST
 *  registration. Only e-Invoicing itself (loadActiveB2bSale) is legally
 *  gated by GSTIN. */
async function loadActiveSale(saleId: number): Promise<LoadedSale> {
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (sale.status !== "active") {
    throw new Error(`${sale.invoiceNo} is ${sale.status}, not active — can't generate.`);
  }
  if (!sale.customerId) {
    throw new Error(`${sale.invoiceNo} has no customer on file.`);
  }
  return sale;
}

/** Active sale to a GST-registered customer — the actual legal boundary
 *  for e-Invoicing (B2B/export only; a placeholder like "URP" for an
 *  unregistered customer doesn't count, however real their purchase was). */
async function loadActiveB2bSale(saleId: number): Promise<LoadedSale> {
  const sale = await loadActiveSale(saleId);
  if (!isValidGstin(sale.customerGstin)) {
    throw new Error(
      `${sale.invoiceNo}: e-Invoicing applies to GST-registered B2B customers ` +
        `only — this customer has no valid GSTIN on file.`
    );
  }
  return sale;
}

/** Reporting-window guard. Business AATO (₹5–10cr) is below the IRP's
 *  10cr enforcement threshold, so this currently never blocks — see
 *  isIrpReportingWindowEnforced. Kept as a call-time check so the block
 *  reactivates itself if the business crosses the threshold. */
function withinReportingWindow(date: Date): boolean {
  return isWithinReportingWindow(date);
}

/** "YYYY-MM-DD HH:mm:ss" (IRP format) → Date. Forgiving, never throws. */
function parseIrpDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value.trim().replace(" ", "T")).getTime();
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function whitebooksErrorMessage(error: unknown): string {
  if (error instanceof WhitebooksError) return error.message;
  if (error instanceof Error) return `WhiteBooks call failed: ${error.message}`;
  return "WhiteBooks call failed with an unknown error.";
}

function toIrnSale(sale: LoadedSale): IrnSale {
  return {
    invoiceNo: sale.invoiceNo,
    date: new Date(sale.date),
    grandTotal: sale.grandTotal,
    billDiscount: sale.discountAmount,
    buyer: {
      name: sale.customerRecordName ?? sale.customerName,
      gstin: sale.customerGstin,
      address: sale.customerAddress,
      pinCode: sale.customerPinCode,
      phone: sale.customerPhone,
      village: sale.customerVillage,
      taluk: sale.customerTaluk,
      district: sale.customerDistrict,
    },
    items: sale.items.map((it) => ({
      name: it.customName?.trim() || it.productName || "Item",
      hsnCode: it.hsnCode,
      qty: it.qty,
      rate: it.rate,
      discountType: it.discountType,
      discountValue: it.discountValue ?? it.discountPercent,
      gstRate: it.gstRate,
      unit: it.unit,
      amount: it.amount,
    })),
  };
}

async function sellerFromSettings(): Promise<IrnSeller> {
  const settings = await getSettings();
  return {
    gstin: settings.gstin,
    name: settings.businessName,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    stateCode: settings.stateCode,
    locality: settings.businessLocality,
    pin: settings.businessPin,
  };
}

async function failIrn(
  saleId: number,
  invoiceNo: string,
  error: unknown,
  /** A failed *cancel* leaves the pushed IRN intact — only the error sticks. */
  keepStatus: "failed" | "pushed" = "failed"
): Promise<never> {
  const message = whitebooksErrorMessage(error);
  await db
    .update(sales)
    .set({ einvoiceStatus: keepStatus, einvoiceError: message.slice(0, 500) })
    .where(eq(sales.id, saleId));
  throw new Error(`${invoiceNo}: ${message}`);
}

/** Generates the e-Invoice/IRN for one sale via WhiteBooks. */
export async function generateIrn(
  saleId: number,
  dispatch: IrnDispatch = null
): Promise<{ irn: string; ackNo: string }> {
  await requireNonDealer();
  const sale = await loadActiveB2bSale(saleId);

  if (sale.irn) {
    throw new Error(`${sale.invoiceNo} already has an IRN — can't push twice.`);
  }
  if (!withinReportingWindow(new Date(sale.date))) {
    throw new Error(
      `${sale.invoiceNo} is older than the IRP's 30-day reporting window ` +
        "(applies at AATO ≥ ₹10cr)."
    );
  }

  const cfg = getWhitebooksConfig();
  await db
    .update(sales)
    .set({ einvoiceStatus: "pending", einvoiceError: null })
    .where(eq(sales.id, saleId));

  try {
    const payload = buildIrnPayload(
      toIrnSale(sale),
      await sellerFromSettings(),
      dispatch
    );
    const data = await wbGenerateIrn(cfg, payload);
    const irn = String(data.Irn ?? "");
    if (!irn) throw new Error("IRP returned no IRN.");
    const ackNo = String(data.AckNo ?? "");
    await db
      .update(sales)
      .set({
        einvoiceStatus: "pushed",
        irn,
        ackNo: ackNo || null,
        ackDate: parseIrpDate(data.AckDt),
        signedQr: typeof data.SignedQRCode === "string" ? data.SignedQRCode : null,
        einvoiceError: null,
        // Full response, untruncated: einvoice_raw is unbounded text, so
        // the complete SignedInvoice survives for reprint/audit. (Truncating
        // it used to destroy exactly the field auditors ask for.)
        einvoiceRaw: JSON.stringify(data),
        // Same-call e-way bill: the IRP returns it on the same response
        // when EwbDtls was included in the payload.
        ...(data.EwbNo
          ? {
              ewbStatus: "generated",
              ewbNo: String(data.EwbNo),
              ewbGeneratedAt: new Date(),
              ewbValidUntil: parseIrpDate(data.EwbValidTill),
              ewbError: null,
              ewbRaw: JSON.stringify(data),
            }
          : {}),
      })
      .where(eq(sales.id, saleId));
    return { irn, ackNo };
  } catch (error) {
    return failIrn(saleId, sale.invoiceNo, error);
  }
}

/** Cancels a pushed e-Invoice. Only within 24h of AckDt (IRP rule). */
export async function cancelIrn(saleId: number, reason: string): Promise<void> {
  await requireNonDealer();
  const sale = await loadActiveB2bSale(saleId);
  if (!sale.irn) {
    throw new Error(`${sale.invoiceNo} has no IRN to cancel.`);
  }
  if ((reason ?? "").trim().length < 3) {
    throw new Error("Give a short reason — the IRP requires one.");
  }
  try {
    await wbCancelIrn(getWhitebooksConfig(), sale.irn, reason.trim());
    await db
      .update(sales)
      .set({ einvoiceStatus: "cancelled", einvoiceError: null })
      .where(eq(sales.id, saleId));
  } catch (error) {
    await failIrn(saleId, sale.invoiceNo, error, "pushed");
  }
}

/**
 * Generates the e-way bill for one sale against its already-pushed IRN.
 * Without dispatch details (and none stored on the sale) there is nothing
 * road-legal to generate from, so that fails up front with a plain message
 * instead of an IRP rejection.
 */
export async function generateEwb(
  saleId: number,
  dispatch: DispatchDetails = {}
): Promise<{ ewbNo: string }> {
  await requireNonDealer();
  const sale = await loadActiveSale(saleId);
  if (!sale.irn) {
    throw new Error(
      `${sale.invoiceNo}: push the e-Invoice first — an e-way bill needs its IRN.`
    );
  }

  const vehicleNo =
    dispatch.vehicleNumber?.trim() || sale.vehicleNo?.trim() || "";
  const distanceKm =
    dispatch.distanceKm ?? (sale.distanceKm != null ? Number(sale.distanceKm) : NaN);
  if (!vehicleNo || !(distanceKm > 0)) {
    throw new Error(
      `${sale.invoiceNo}: vehicle number and distance are required for an e-way bill.`
    );
  }

  const cfg = getWhitebooksConfig();
  await db
    .update(sales)
    .set({ ewbStatus: "pending", ewbError: null })
    .where(eq(sales.id, saleId));
  try {
    const data = await wbGenerateEwbByIrn(cfg, {
      irn: sale.irn,
      distanceKm,
      vehicleNo,
      transporterName:
        dispatch.transporterName?.trim() || sale.transporterName?.trim() || null,
      transporterGstin: isValidGstin(sale.transporterGstin)
        ? sale.transporterGstin!.trim().toUpperCase()
        : null,
    });
    const ewbNo = String(data.EwbNo ?? "");
    if (!ewbNo) throw new Error("IRP returned no e-way bill number.");
    await db
      .update(sales)
      .set({
        ewbStatus: "generated",
        ewbNo,
        ewbGeneratedAt: new Date(),
        ewbValidUntil: parseIrpDate(data.EwbValidTill),
        ewbError: null,
        ewbRaw: JSON.stringify(data),
      })
      .where(eq(sales.id, saleId));
    return { ewbNo };
  } catch (error) {
    const message = whitebooksErrorMessage(error);
    await db
      .update(sales)
      .set({ ewbStatus: "failed", ewbError: message.slice(0, 500) })
      .where(eq(sales.id, saleId));
    throw new Error(`${sale.invoiceNo}: ${message}`);
  }
}

/** Cancels a generated e-way bill. Only within 24h of generation (NIC rule). */
export async function cancelEwb(saleId: number, reason: string): Promise<void> {
  await requireNonDealer();
  const sale = await loadActiveSale(saleId);
  if (!sale.ewbNo) {
    throw new Error(`${sale.invoiceNo} has no e-way bill to cancel.`);
  }
  if ((reason ?? "").trim().length < 3) {
    throw new Error("Give a short reason — the e-way bill system requires one.");
  }
  try {
    await wbCancelEwb(getWhitebooksConfig(), sale.ewbNo, reason.trim());
    await db
      .update(sales)
      .set({ ewbStatus: "cancelled", ewbError: null })
      .where(eq(sales.id, saleId));
  } catch (error) {
    const message = whitebooksErrorMessage(error);
    await db
      .update(sales)
      .set({ ewbError: message.slice(0, 500) })
      .where(eq(sales.id, saleId));
    throw new Error(`${sale.invoiceNo}: ${message}`);
  }
}

export type DispatchDetails = {
  vehicleNumber?: string;
  transporterName?: string;
  /** GSTIN of the transporter, if they're GST-registered. */
  transporterGstin?: string;
  /** km, approximate. */
  distanceKm?: number;
  /** "road" | "rail" | "air" | "ship". */
  transportMode?: string;
};

/**
 * Read-only lookups against pushed documents. These never write to the
 * database — they answer "what does the IRP actually hold?" after an
 * uncertain push, a 72-hour-window check, or an e-way bill verification.
 * Only the last 72 hours are queryable (IRP rule).
 */
export async function fetchIrnDetails(
  saleId: number
): Promise<Record<string, unknown>> {
  await requireNonDealer();
  const sale = await loadActiveSale(saleId);
  if (!sale.irn) {
    throw new Error(`${sale.invoiceNo} has no IRN to look up.`);
  }
  try {
    return await wbGetIrnDetails(getWhitebooksConfig(), sale.irn);
  } catch (error) {
    throw new Error(`${sale.invoiceNo}: ${whitebooksErrorMessage(error)}`);
  }
}

/**
 * Find an IRN by document type/number/date — the recovery path when a push
 * timed out and the sale row was left without an IRN. This app only ever
 * sends `Typ: "INV"`, so the type is fixed, not asked.
 */
export async function fetchIrnByDocDetails(
  saleId: number
): Promise<Record<string, unknown>> {
  await requireNonDealer();
  const sale = await loadActiveSale(saleId);
  try {
    return await wbGetIrnByDocDetails(getWhitebooksConfig(), {
      docType: "INV",
      docNo: sale.invoiceNo,
      docDate: new Date(sale.date),
    });
  } catch (error) {
    throw new Error(`${sale.invoiceNo}: ${whitebooksErrorMessage(error)}`);
  }
}

/** Fetch e-way bill details against the sale's pushed IRN. */
export async function fetchEwaybillDetailsByIrn(
  saleId: number
): Promise<Record<string, unknown>> {
  await requireNonDealer();
  const sale = await loadActiveSale(saleId);
  if (!sale.irn) {
    throw new Error(`${sale.invoiceNo} has no IRN to look up e-way bills for.`);
  }
  try {
    return await wbGetEwaybillDetailsByIrn(getWhitebooksConfig(), sale.irn);
  } catch (error) {
    throw new Error(`${sale.invoiceNo}: ${whitebooksErrorMessage(error)}`);
  }
}

/**
 * Saves dispatch details on a sale WITHOUT attempting to generate an
 * e-way bill — for fixing a "missing details" invoice ahead of time. Only
 * touches these fields on skywin-bill's own `sales` row; no third party
 * involved, so this keeps working regardless of the stubs above.
 */
export async function updateDispatchDetails(
  saleId: number,
  dispatch: DispatchDetails
) {
  await requireNonDealer();
  await db
    .update(sales)
    .set({
      vehicleNo: dispatch.vehicleNumber?.trim() || null,
      transporterName: dispatch.transporterName?.trim() || null,
      transporterGstin: dispatch.transporterGstin?.trim() || null,
      transportMode: dispatch.transportMode ?? null,
      distanceKm: dispatch.distanceKm != null ? String(dispatch.distanceKm) : null,
    })
    .where(eq(sales.id, saleId));
}
