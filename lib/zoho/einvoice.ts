/**
 * e-Invoice (IRN) push/cancel against Zoho's confirmed endpoints.
 *
 * Endpoints:
 *   POST /invoices/{id}/einvoice/push
 *   POST /invoices/{id}/einvoice/cancel
 *   GET  /invoices/{id}            (read back einvoice_details)
 *
 * Confirmed against a real push (SKYA/0407/26-27, 2026-09-15 — a genuine
 * government IRN, not a sandbox one): `inv_ref_num`, `status`,
 * `ack_number`, `ack_date`, `qr_link` all come back as named here.
 *
 * Still NOT independently verified: the `einvoice/cancel` request body —
 * no real IRN has been cancelled yet. Confirm the shape against a real
 * (or at least a genuinely necessary) cancellation before relying on it.
 */
import { zohoRequest } from "./client";

type EinvoiceDetails = {
  status?: string; // "yet_to_be_pushed" | "generated" | "pushed" | "failed" | ...
  inv_ref_num?: string; // the IRN
  ack_number?: string;
  ack_date?: string; // "YYYY-MM-DD HH:mm:ss"
  qr_link?: string; // Zoho-hosted QR code image URL, not the raw signed QR payload
  [key: string]: unknown;
};

export type PushResult = {
  irn: string | null;
  status: string | null;
  ackNumber: string | null;
  ackDate: string | null;
  qrLink: string | null;
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
    ackNumber: raw.ack_number || null,
    ackDate: raw.ack_date || null,
    qrLink: raw.qr_link || null,
    raw,
  };
}

/** Shared shape for the `sales` row update after a push — used by both the
 *  generateIrn server action and the zoho-push-einvoice.ts one-off script. */
export function einvoiceUpdateFields(pushed: PushResult) {
  return {
    einvoiceStatus: pushed.irn ? ("pushed" as const) : ("pending" as const),
    irn: pushed.irn,
    ackNo: pushed.ackNumber,
    ackDate: pushed.ackDate ? new Date(pushed.ackDate) : null,
    // Zoho's `qr_link` is a hosted QR *image* URL, not the raw signed QR
    // payload string the government schema technically defines — it's what
    // Zoho's API actually gives back, so it's what's stored here.
    signedQr: pushed.qrLink,
    einvoiceRaw: JSON.stringify(pushed.raw),
    einvoiceError: null,
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
