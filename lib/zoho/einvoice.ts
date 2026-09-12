/**
 * e-Invoice (IRN) push/cancel against Zoho's confirmed endpoints.
 *
 * Endpoints confirmed via Zoho's own API docs search results + the "Push to
 * IRP" flow shown in Zoho Books' e-Invoicing settings page:
 *   POST /invoices/{id}/einvoice/push
 *   POST /invoices/{id}/einvoice/cancel
 *   GET  /invoices/{id}            (read back einvoice_details)
 *
 * What's NOT independently verified: the exact `einvoice_details` field
 * names after a *successful* push, and the `einvoice/cancel` request body.
 * A real invoice was never actually pushed while building this (that
 * mints a real IRN against the real GSTIN — a deliberate, separate step,
 * not something to do while writing code). Only `inv_ref_num` (→ IRN) is
 * confirmed, from the pre-push state of a real invoice
 * (`"inv_ref_num":""` before push). The full raw response is kept in
 * `sales.einvoice_raw` for exactly this reason — inspect it after the
 * first real push and extend the mapping below if other fields matter
 * (ack number, ack date, the signed QR payload).
 */
import { zohoRequest } from "./client";

type EinvoiceDetails = {
  status?: string; // "yet_to_be_pushed" | "generated" | ... (unconfirmed set)
  inv_ref_num?: string; // the IRN, confirmed field name
  [key: string]: unknown;
};

export type PushResult = {
  irn: string | null;
  status: string | null;
  raw: EinvoiceDetails;
};

/** Marks the invoice Sent — some Zoho flows require this before an
 *  e-invoice push; harmless if it's already not a draft. */
async function markSent(zohoInvoiceId: string): Promise<void> {
  try {
    await zohoRequest("POST", `/invoices/${zohoInvoiceId}/status/sent`);
  } catch {
    // Already sent/paid — Zoho errors on a no-op status change. Not fatal.
  }
}

export async function pushEInvoice(zohoInvoiceId: string): Promise<PushResult> {
  await markSent(zohoInvoiceId);
  await zohoRequest("POST", `/invoices/${zohoInvoiceId}/einvoice/push`);

  const detail = await zohoRequest<{ invoice: { einvoice_details?: EinvoiceDetails } }>(
    "GET",
    `/invoices/${zohoInvoiceId}`
  );
  const raw = detail.invoice.einvoice_details ?? {};
  return {
    irn: raw.inv_ref_num || null,
    status: raw.status ?? null,
    raw,
  };
}

/**
 * UNVERIFIED body shape — inferred from Zoho's general cancel-transaction
 * pattern (a required reason string), not exercised against a real IRN.
 * Confirm against a real (test) cancellation before relying on this.
 */
export async function cancelEInvoice(
  zohoInvoiceId: string,
  reason: string
): Promise<void> {
  await zohoRequest("POST", `/invoices/${zohoInvoiceId}/einvoice/cancel`, {
    body: { cancel_reason: reason },
  });
}
