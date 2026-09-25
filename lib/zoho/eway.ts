/**
 * e-Way Bill generate/cancel against Zoho's endpoints.
 *
 * `generateEwayBill`'s request/response shape is confirmed against a real
 * (test, immediately deleted) call on this org's live data — see the
 * "e-invoice/e-way build" conversation for the raw response this was built
 * from. `cancelEwayBill` and `extendValidity` are NOT verified — Zoho's
 * public docs don't expose their bodies, and confirming them the same way
 * `generate` was confirmed means acting on a *real, generated* e-way bill,
 * which hasn't happened yet. Test those deliberately before relying on them.
 */
import { zohoRequest } from "./client";
import { markInvoiceSent } from "./sync";

export type EwayBill = {
  ewaybill_id: string;
  entity_id: string;
  entity_type: string;
  ewaybill_number: string;
  ewaybill_date: string;
  ewaybill_status: string; // "yet_to_generate" confirmed; others inferred
  ewaybill_expiry_date: string;
  transporter_id?: string;
  transporter_name?: string;
  vehicle_number?: string;
  distance?: string;
  [key: string]: unknown;
};

export type DispatchDetails = {
  vehicleNumber?: string;
  transporterName?: string;
  /** GSTIN of the transporter, if they're GST-registered. */
  transporterGstin?: string;
  /** km, approximate — the IRP/e-way system wants an integer-ish distance. */
  distanceKm?: number;
  /** "road" | "rail" | "air" | "ship" — Zoho's exact enum unconfirmed;
   *  omit rather than guess wrong if not supplied. */
  transportMode?: string;
  /** Destination state, as Zoho's 2-letter code (e.g. "TN") — Zoho's
   *  e-Way Bill UI shows this as a required "Place of Delivery" field
   *  that ISN'T auto-filled from the invoice's ship-to/bill-to address
   *  when there's no separate shipping address on the contact. Confirmed
   *  as a real, live cause of a silent government-side rejection
   *  (is_vehicle_details_push_failed) — the shell created fine without
   *  it, but never actually reached NIC. */
  placeOfDeliveryStateCode?: string;
};

/**
 * Generates (or re-fetches/updates) the e-way bill shell for an invoice.
 * Note: this alone does NOT push to NIC — the response's `ewaybill_status`
 * stays "yet_to_generate" until vehicle/transporter details are complete
 * and Zoho actually submits it. Confirmed empirically: calling this with
 * no dispatch details at all still succeeds and creates a shell record.
 */
export async function generateEwayBill(
  zohoInvoiceId: string,
  dispatch: DispatchDetails = {}
): Promise<EwayBill> {
  // A draft invoice is not a document you can file against — see
  // markInvoiceSent. The e-Invoice path has always done this; this one
  // did not, and a real ₹3.3L e-way bill (INV-20260924-1056) was rejected
  // for it while an otherwise field-for-field identical one on a sent
  // invoice generated fine.
  await markInvoiceSent(zohoInvoiceId);

  const body: Record<string, unknown> = {
    entity_type: "invoice",
    entity_id: zohoInvoiceId,
    // Found in Zoho's own documented example, never sent by this code
    // before: without `action: "save_generate"`, every prior real test
    // (four of them, across this whole build) created a correct-looking
    // local shell — vehicle number, distance, place of delivery all
    // saved fine — but is_vehicle_details_push_failed stayed true on
    // every one, meaning Zoho likely only *saved* it locally and never
    // actually told the government to generate it. `transaction_type`
    // is from the same documented example.
    transaction_type: "regular",
    action: "save_generate",
  };
  if (dispatch.vehicleNumber) body.vehicle_number = dispatch.vehicleNumber;
  if (dispatch.transporterName) body.transporter_name = dispatch.transporterName;
  if (dispatch.transporterGstin) body.transporter_id = dispatch.transporterGstin;
  if (dispatch.distanceKm !== undefined) body.distance = dispatch.distanceKm;
  // Confirmed required, not optional: omitting this (the previous
  // behavior, on the theory that guessing wrong beats guessing at all)
  // produced "Please provide a valid transportation mode / transit type
  // for the e-Way Bill" once action:"save_generate" actually triggered
  // real validation. "road" is the only mode this business has ever
  // needed — Zoho's own shell responses defaulted to displaying "road"
  // even when we sent nothing, which is what led here.
  body.transportation_mode = dispatch.transportMode || "road";
  if (dispatch.placeOfDeliveryStateCode) {
    body.place_of_delivery = dispatch.placeOfDeliveryStateCode;
  }

  const res = await zohoRequest<{ ewaybill: EwayBill }>("POST", "/ewaybills", { body });
  return res.ewaybill;
}

/**
 * Read-only: the current e-way bill for an invoice, if Zoho has one on
 * file — via the invoice's own `ewaybill_id`, then the dedicated detail
 * endpoint (confirmed reliable throughout this build). Returns null if
 * the invoice has never had an e-way bill shell created for it at all.
 * For reconciling a status that changed on Zoho's side without going
 * through our own push — e.g. someone associated a manually-generated,
 * real government e-way bill via Zoho's own "Fetch From Portal".
 */
export async function getEwayBillStatus(zohoInvoiceId: string): Promise<EwayBill | null> {
  const invoiceDetail = await zohoRequest<{ invoice: { ewaybill_id?: string } }>(
    "GET",
    `/invoices/${zohoInvoiceId}`
  );
  const ewaybillId = invoiceDetail.invoice.ewaybill_id;
  if (!ewaybillId) return null;

  const res = await zohoRequest<{ ewaybill: EwayBill }>("GET", `/ewaybills/${ewaybillId}`);
  return res.ewaybill;
}

/** UNVERIFIED — see file header. */
export async function cancelEwayBill(ewaybillId: string, reason: string): Promise<void> {
  await zohoRequest("POST", `/ewaybills/${ewaybillId}/cancel`, {
    body: { cancel_reason: reason },
  });
}

/** Deletes an e-way bill shell (confirmed working — this is how the test
 *  record made while building this feature was cleaned up). Only valid
 *  while it's still "yet_to_generate"; a real, NIC-issued e-way bill can't
 *  be deleted, only cancelled within the legal window. */
export async function deleteEwayBillShell(ewaybillId: string): Promise<void> {
  await zohoRequest("DELETE", `/ewaybills/${ewaybillId}`);
}
