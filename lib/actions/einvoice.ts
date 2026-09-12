"use server";

/**
 * Server actions for syncing sales to Zoho Books and pushing e-Invoice /
 * e-Way Bill for them. See lib/zoho/* for the API layer this wires up.
 */
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { getSaleById } from "@/lib/queries/sales";
import { EINVOICE_REPORTING_WINDOW_DAYS } from "@/lib/queries/einvoice";
import { requireNonDealer } from "@/lib/actions/auth";
import { toNumber } from "@/lib/utils";
import {
  upsertInvoice,
  type SyncCustomer,
  type SyncSale,
  type SyncSaleItem,
} from "@/lib/zoho/sync";
import { pushEInvoice, cancelEInvoice } from "@/lib/zoho/einvoice";
import { generateEwayBill, type DispatchDetails } from "@/lib/zoho/eway";

type LoadedSale = NonNullable<Awaited<ReturnType<typeof getSaleById>>>;

function toSyncInputs(sale: LoadedSale) {
  const syncSale: SyncSale = {
    invoiceNo: sale.invoiceNo,
    date: format(new Date(sale.date), "yyyy-MM-dd"),
    grandTotal: toNumber(sale.grandTotal),
    igst: toNumber(sale.igst),
  };
  const customer: SyncCustomer = {
    name: sale.customerRecordName || sale.customerName || "Customer",
    gstin: (sale.customerGstin || "").trim(),
    phone: sale.customerPhone,
    address: sale.customerAddress,
    district: sale.customerDistrict,
    pinCode: sale.customerPinCode,
  };
  const items: SyncSaleItem[] = sale.items.map((item) => ({
    productName: String(item.productName || item.customName || "Item"),
    hsnCode: item.hsnCode || "",
    unit: item.unit || "pcs",
    qty: toNumber(item.qty),
    rate: toNumber(item.rate),
    amount: toNumber(item.amount),
    gstRate: toNumber(item.gstRate),
  }));
  return { syncSale, customer, items };
}

async function loadActiveB2bSale(saleId: number): Promise<LoadedSale> {
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (sale.status !== "active") {
    throw new Error(`${sale.invoiceNo} is ${sale.status}, not active — can't sync.`);
  }
  if (!sale.customerGstin?.trim()) {
    throw new Error(`${sale.invoiceNo} has no customer GSTIN — B2B only.`);
  }
  return sale;
}

/** Pushes a sale to Zoho Books as an invoice, if it isn't there already. */
export async function syncSaleToZoho(saleId: number) {
  await requireNonDealer();
  const sale = await loadActiveB2bSale(saleId);

  if (sale.zohoInvoiceId) {
    return { zohoInvoiceId: sale.zohoInvoiceId, alreadySynced: true as const };
  }

  const { syncSale, customer, items } = toSyncInputs(sale);
  const result = await upsertInvoice({ sale: syncSale, items, customer });

  await db
    .update(sales)
    .set({ zohoInvoiceId: result.zohoInvoiceId, zohoContactId: result.zohoContactId })
    .where(eq(sales.id, saleId));

  return { ...result, alreadySynced: false as const };
}

function withinReportingWindow(date: Date): boolean {
  const ageMs = Date.now() - date.getTime();
  return ageMs <= EINVOICE_REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Syncs (if needed) then pushes the e-Invoice/IRN for one sale. */
export async function generateIrn(saleId: number) {
  await requireNonDealer();
  const sale = await loadActiveB2bSale(saleId);

  if (sale.irn) {
    throw new Error(`${sale.invoiceNo} already has an IRN — can't push twice.`);
  }
  if (!withinReportingWindow(new Date(sale.date))) {
    throw new Error(
      `${sale.invoiceNo} is older than the IRP's ${EINVOICE_REPORTING_WINDOW_DAYS}-day reporting window.`
    );
  }

  let zohoInvoiceId = sale.zohoInvoiceId;
  if (!zohoInvoiceId) {
    const synced = await syncSaleToZoho(saleId);
    zohoInvoiceId = synced.zohoInvoiceId;
  }

  try {
    const pushed = await pushEInvoice(zohoInvoiceId!);
    await db
      .update(sales)
      .set({
        einvoiceStatus: pushed.irn ? "pushed" : "pending",
        irn: pushed.irn,
        einvoiceRaw: JSON.stringify(pushed.raw),
        einvoiceError: null,
      })
      .where(eq(sales.id, saleId));
    return pushed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sales)
      .set({ einvoiceStatus: "failed", einvoiceError: message })
      .where(eq(sales.id, saleId));
    throw err;
  }
}

/** Cancels a pushed e-Invoice. Only legal within 24h of the IRN — Zoho/the
 *  IRP itself enforces that window; this doesn't re-check it client-side. */
export async function cancelIrn(saleId: number, reason: string) {
  await requireNonDealer();
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (!sale.zohoInvoiceId || !sale.irn) {
    throw new Error(`${sale.invoiceNo} has no IRN to cancel.`);
  }

  await cancelEInvoice(sale.zohoInvoiceId, reason);
  await db
    .update(sales)
    .set({ einvoiceStatus: "cancelled" })
    .where(eq(sales.id, saleId));
}

/** Syncs (if needed) then generates the e-Way Bill shell for one sale. */
export async function generateEwb(saleId: number, dispatch: DispatchDetails) {
  await requireNonDealer();
  const sale = await loadActiveB2bSale(saleId);

  let zohoInvoiceId = sale.zohoInvoiceId;
  if (!zohoInvoiceId) {
    const synced = await syncSaleToZoho(saleId);
    zohoInvoiceId = synced.zohoInvoiceId;
  }

  try {
    const ewb = await generateEwayBill(zohoInvoiceId!, dispatch);
    await db
      .update(sales)
      .set({
        ewbStatus: ewb.ewaybill_number ? "generated" : "pending",
        ewbNo: ewb.ewaybill_number || null,
        ewbValidUntil: ewb.ewaybill_expiry_date
          ? new Date(ewb.ewaybill_expiry_date)
          : null,
        ewbRaw: JSON.stringify(ewb),
        ewbError: null,
        transporterGstin: dispatch.transporterGstin ?? null,
        transportMode: dispatch.transportMode ?? null,
        distanceKm: dispatch.distanceKm != null ? String(dispatch.distanceKm) : null,
      })
      .where(eq(sales.id, saleId));
    return ewb;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sales)
      .set({ ewbStatus: "failed", ewbError: message })
      .where(eq(sales.id, saleId));
    throw err;
  }
}
