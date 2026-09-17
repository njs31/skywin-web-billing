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
import { isValidGstin } from "@/lib/gst";
import { BUSINESS } from "@/lib/business";
import { zohoStateCode } from "@/lib/zoho/gst";
import { upsertInvoice, toSyncInputs, ensureContact } from "@/lib/zoho/sync";
import {
  pushEInvoice,
  cancelEInvoice,
  einvoiceUpdateFields,
  getEinvoiceStatus,
} from "@/lib/zoho/einvoice";
import {
  generateEwayBill,
  cancelEwayBill,
  getEwayBillStatus,
  type DispatchDetails,
} from "@/lib/zoho/eway";

type LoadedSale = NonNullable<Awaited<ReturnType<typeof getSaleById>>>;
/**
 * Any active sale with a customer on file — GSTIN not required. This is
 * as far as "sync to Zoho" needs to go: an e-way bill applies to goods
 * movement regardless of the buyer's GST registration, so the underlying
 * Zoho invoice has to exist for an unregistered customer too. Only
 * e-Invoicing itself (loadActiveB2bSale, below) is legally gated by GSTIN.
 */
async function loadActiveSale(saleId: number): Promise<LoadedSale> {
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (sale.status !== "active") {
    throw new Error(`${sale.invoiceNo} is ${sale.status}, not active — can't sync.`);
  }
  if (!sale.customerId) {
    throw new Error(`${sale.invoiceNo} has no customer on file — can't sync to Zoho.`);
  }
  return sale;
}

/**
 * Active sale to a GST-registered customer — the actual legal boundary
 * for e-Invoicing (B2B/export only; a placeholder like "URP" for an
 * unregistered customer doesn't count, however real their purchase was).
 */
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

/** Pushes a sale to Zoho Books as an invoice, if it isn't there already.
 *  Works for any customer, registered or not — see loadActiveSale. */
export async function syncSaleToZoho(saleId: number) {
  await requireNonDealer();
  const sale = await loadActiveSale(saleId);

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
    if (sale.zohoInvoiceId) {
      // Invoice already existed from an earlier sync — but ensureContact's
      // refresh-on-every-call behavior only runs when ensureContact itself
      // is called, which an already-synced invoice otherwise skips.
      // Without this, a contact created before a data fix (e.g. an
      // address that used to be too long for Zoho) stays stale forever,
      // and every push keeps failing on the same already-fixed-on-our-side
      // problem. Confirmed as a real, live case, not theoretical.
      const { customer } = toSyncInputs(sale);
      await ensureContact(customer);
    }
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
  // Deliberately loadActiveSale, not loadActiveB2bSale — an e-way bill
  // applies to goods movement above the value threshold regardless of
  // whether the buyer is GST-registered (see requiresEwayBill/lib/gst.ts).
  const sale = await loadActiveSale(saleId);

  // Zoho's e-Way Bill UI shows this as a required "Place of Delivery"
  // field that's NOT auto-filled from the invoice when the contact has
  // no separate shipping address — confirmed as a real, live cause of a
  // silent government-side rejection. Derived the same way place of
  // supply already is: from the customer's own GSTIN when registered,
  // falling back to our own business's state for an unregistered
  // customer (consistent with the intrastate assumption isInterstateGst
  // already makes when there's no GSTIN to read a state from).
  const placeOfDeliveryStateCode = isValidGstin(sale.customerGstin)
    ? zohoStateCode(sale.customerGstin)
    : zohoStateCode(BUSINESS.stateCode);

  const resolved: DispatchDetails = {
    vehicleNumber: dispatch.vehicleNumber ?? sale.vehicleNo ?? undefined,
    transporterName: dispatch.transporterName ?? sale.transporterName ?? undefined,
    transporterGstin: dispatch.transporterGstin ?? sale.transporterGstin ?? undefined,
    distanceKm:
      dispatch.distanceKm ??
      (sale.distanceKm != null ? Number(sale.distanceKm) : undefined),
    transportMode: dispatch.transportMode,
    placeOfDeliveryStateCode,
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

  let ewb: Awaited<ReturnType<typeof generateEwayBill>>;
  try {
    if (sale.zohoInvoiceId) {
      // Same reasoning as generateIrn: refresh the contact so a data fix
      // made after the invoice was first synced (e.g. a too-long
      // address) actually reaches Zoho instead of the push repeating the
      // same already-fixed-on-our-side failure forever.
      const { customer } = toSyncInputs(sale);
      await ensureContact(customer);
    }
    ewb = await generateEwayBill(zohoInvoiceId!, resolved);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sales)
      .set({ ewbStatus: "failed", ewbError: message })
      .where(eq(sales.id, saleId));
    throw err;
  }

  // Prefer Zoho's own generation timestamp; fall back to "now" if it's
  // missing or doesn't parse — a real e-way bill was still just created
  // either way, so the cancel-window countdown needs some start point.
  const parsedGeneratedAt = ewb.ewaybill_date ? new Date(ewb.ewaybill_date) : null;
  const generatedAt =
    parsedGeneratedAt && !Number.isNaN(parsedGeneratedAt.getTime())
      ? parsedGeneratedAt
      : new Date();
  // Confirmed a real, silent failure mode: Zoho's POST succeeds (HTTP 200,
  // a shell record created) even when the actual government submission is
  // rejected — the only signal is this flag, with no error text anywhere
  // in the response. Treating it as "pending" with no explanation left
  // the UI showing nothing had gone wrong when it plainly had. Handled
  // outside the try/catch above (not a thrown exception from the API
  // call) so there's exactly one DB write and one plain Error thrown for
  // this case, not two — a custom Error subclass thrown across the
  // Server Action boundary here previously didn't survive Next.js's
  // serialization back to the client and surfaced as an opaque generic
  // message instead of this one.
  const vehicleDetailsPushFailed = ewb.is_vehicle_details_push_failed === true;
  const ewbStatus = ewb.ewaybill_number
    ? "generated"
    : vehicleDetailsPushFailed
      ? "failed"
      : "pending";
  const ewbError = vehicleDetailsPushFailed
    ? "Zoho created the e-way bill locally but the government submission " +
      "failed (Zoho gives no specific reason via the API for this one — " +
      "check this e-way bill directly in Zoho Books for a fuller message)."
    : null;
  await db
    .update(sales)
    .set({
      ewbStatus,
      ewbId: ewb.ewaybill_id || null,
      ewbNo: ewb.ewaybill_number || null,
      ewbGeneratedAt: ewb.ewaybill_number ? generatedAt : null,
      ewbValidUntil: ewb.ewaybill_expiry_date ? new Date(ewb.ewaybill_expiry_date) : null,
      ewbRaw: JSON.stringify(ewb),
      ewbError,
    })
    .where(eq(sales.id, saleId));

  // Deliberately not thrown: this is a known, already-recorded outcome,
  // not an exception. Next.js redacts a thrown Server Action error's
  // message in production regardless of what's thrown (confirmed — see
  // this function's earlier revision, and generateIrn's genuine
  // exceptions have the same exposure), so the caller refreshing the
  // page and reading the persisted ewbStatus/ewbError back is the
  // reliable channel, not an inline exception message.
  return ewb;
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

/**
 * Pulls the current e-Invoice and e-Way Bill status from Zoho and saves
 * whatever's there — without pushing anything. For reconciling a case
 * our own push flow never sees: a real government e-way bill generated
 * by someone directly on the government portal (Mode: WEB) and then
 * associated to the invoice in Zoho via its own "Fetch From Portal", or
 * any other change made straight in Zoho's UI. Confirmed necessary from
 * a real, live case, not theoretical — see the "URP e-way bill" work.
 */
export async function syncStatusFromZoho(saleId: number) {
  await requireNonDealer();
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (!sale.zohoInvoiceId) {
    throw new Error(`${sale.invoiceNo} hasn't been synced to Zoho yet — nothing to check.`);
  }

  const [einvoice, ewb] = await Promise.all([
    getEinvoiceStatus(sale.zohoInvoiceId),
    getEwayBillStatus(sale.zohoInvoiceId),
  ]);

  await db
    .update(sales)
    .set(einvoiceUpdateFields(einvoice))
    .where(eq(sales.id, saleId));

  if (ewb) {
    await db
      .update(sales)
      .set({
        ewbStatus: ewb.ewaybill_number ? "generated" : "pending",
        ewbId: ewb.ewaybill_id || null,
        ewbNo: ewb.ewaybill_number || null,
        ewbGeneratedAt: ewb.ewaybill_date ? new Date(ewb.ewaybill_date) : null,
        ewbValidUntil: ewb.ewaybill_expiry_date ? new Date(ewb.ewaybill_expiry_date) : null,
        ewbRaw: JSON.stringify(ewb),
        ewbError: null,
      })
      .where(eq(sales.id, saleId));
  }

  return {
    einvoiceFound: Boolean(einvoice.irn),
    ewbFound: Boolean(ewb?.ewaybill_number),
  };
}
