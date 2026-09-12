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
  const body: Record<string, unknown> = {
    entity_type: "invoice",
    entity_id: zohoInvoiceId,
  };
  if (dispatch.vehicleNumber) body.vehicle_number = dispatch.vehicleNumber;
  if (dispatch.transporterName) body.transporter_name = dispatch.transporterName;
  if (dispatch.transporterGstin) body.transporter_id = dispatch.transporterGstin;
  if (dispatch.distanceKm !== undefined) body.distance = dispatch.distanceKm;
  if (dispatch.transportMode) body.transportation_mode = dispatch.transportMode;

  const res = await zohoRequest<{ ewaybill: EwayBill }>("POST", "/ewaybills", { body });
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
