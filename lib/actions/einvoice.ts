"use server";

/**
 * Server actions for syncing sales to Zoho Books and pushing e-Invoice /
 * e-Way Bill for them. See lib/zoho/* for the API layer this wires up.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { getSaleById } from "@/lib/queries/sales";
import { EINVOICE_REPORTING_WINDOW_DAYS } from "@/lib/queries/einvoice";
import { requireNonDealer } from "@/lib/actions/auth";
import { upsertInvoice, toSyncInputs } from "@/lib/zoho/sync";
import { pushEInvoice, cancelEInvoice, einvoiceUpdateFields } from "@/lib/zoho/einvoice";
import { generateEwayBill, cancelEwayBill, type DispatchDetails } from "@/lib/zoho/eway";

type LoadedSale = NonNullable<Awaited<ReturnType<typeof getSaleById>>>;

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
  try {
    const result = await upsertInvoice({ sale: syncSale, items, customer });
    await db
      .update(sales)
      .set({
        zohoInvoiceId: result.zohoInvoiceId,
        zohoContactId: result.zohoContactId,
        zohoSyncError: null,
      })
      .where(eq(sales.id, saleId));
    return { ...result, alreadySynced: false as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sales)
      .set({ zohoSyncError: message })
      .where(eq(sales.id, saleId));
    throw err;
  }
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
      .set(einvoiceUpdateFields(pushed))
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

/**
 * Syncs (if needed) then generates the e-Way Bill shell for one sale.
 *
 * `dispatch` is optional — any field left out falls back to what's already
 * stored on the sale (vehicle no. / transporter name / GSTIN / distance
 * captured at billing time, when the operator filled those in because the
 * bill crossed the e-way threshold). This is what makes the one-click path
 * possible: when billing already captured everything, the e-Way Bill page
 * can call this with no `dispatch` at all.
 */
export async function generateEwb(
  saleId: number,
  dispatch: DispatchDetails = {}
) {
  await requireNonDealer();
  const sale = await loadActiveB2bSale(saleId);

  const resolved: DispatchDetails = {
    vehicleNumber: dispatch.vehicleNumber ?? sale.vehicleNo ?? undefined,
    transporterName: dispatch.transporterName ?? sale.transporterName ?? undefined,
    transporterGstin: dispatch.transporterGstin ?? sale.transporterGstin ?? undefined,
    distanceKm:
      dispatch.distanceKm ??
      (sale.distanceKm != null ? Number(sale.distanceKm) : undefined),
    transportMode: dispatch.transportMode,
  };

  // Persist whatever was entered before attempting the push — otherwise a
  // failed push (Zoho down, IRN not yet generated, etc.) would silently
  // discard details someone just typed in to fix a "missing" invoice.
  await db
    .update(sales)
    .set({
      vehicleNo: resolved.vehicleNumber ?? null,
      transporterName: resolved.transporterName ?? null,
      transporterGstin: resolved.transporterGstin ?? null,
      transportMode: resolved.transportMode ?? null,
      distanceKm: resolved.distanceKm != null ? String(resolved.distanceKm) : null,
    })
    .where(eq(sales.id, saleId));

  let zohoInvoiceId = sale.zohoInvoiceId;
  if (!zohoInvoiceId) {
    const synced = await syncSaleToZoho(saleId);
    zohoInvoiceId = synced.zohoInvoiceId;
  }

  try {
    const ewb = await generateEwayBill(zohoInvoiceId!, resolved);
    await db
      .update(sales)
      .set({
        ewbStatus: ewb.ewaybill_number ? "generated" : "pending",
        ewbId: ewb.ewaybill_id || null,
        ewbNo: ewb.ewaybill_number || null,
        ewbValidUntil: ewb.ewaybill_expiry_date
          ? new Date(ewb.ewaybill_expiry_date)
          : null,
        ewbRaw: JSON.stringify(ewb),
        ewbError: null,
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

/**
 * Cancels a generated e-way bill. Only legal within the government's
 * cancellation window (24h from generation, and only if not yet verified
 * by an officer in transit) — Zoho/the IRP itself enforces that, not this.
 * UNVERIFIED request shape (see lib/zoho/eway.ts's cancelEwayBill) —
 * confirm against a real e-way bill before relying on this.
 */
export async function cancelEwb(saleId: number, reason: string) {
  await requireNonDealer();
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (!sale.ewbId || !sale.ewbNo) {
    throw new Error(`${sale.invoiceNo} has no e-way bill to cancel.`);
  }

  await cancelEwayBill(sale.ewbId, reason);
  await db
    .update(sales)
    .set({ ewbStatus: "cancelled" })
    .where(eq(sales.id, saleId));
}

/**
 * Saves dispatch details on a sale WITHOUT attempting to push an e-way
 * bill — for fixing a "missing details" invoice ahead of time, separately
 * from actually pushing it. Narrowly scoped: only touches these four
 * fields, never items, amounts, or anything already reported to Zoho/IRP.
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
