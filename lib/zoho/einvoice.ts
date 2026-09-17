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
 * The rejection shape (`status: "failed"`, `failure_list`) is confirmed
 * too, from a real rejected push (SKYA/0385/26-27) — and both the push
 * and the follow-up GET return a plain HTTP 200 either way, so `status`/
 * `failure_list` is the only signal a caller has.
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
  /** Zoho/IRP's own rejection reasons, e.g. "The other charges (Shipping
   *  Charge + Adjustment) cannot be a negative amount." — confirmed
   *  against a real rejected push. */
  failure_list?: string[];
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

  // Confirmed against a real rejected push (SKYA/0385/26-27): the push
  // endpoint itself and this follow-up GET both return a plain HTTP 200 —
  // there's no HTTP-level signal that the push was rejected. The real
  // outcome only shows up in this "status"/"failure_list" pair, so without
  // this check a rejected push looked identical to a genuine success.
  if (raw.status === "failed") {
    const reasons = Array.isArray(raw.failure_list)
      ? raw.failure_list.filter((r): r is string => typeof r === "string")
      : [];
    throw new Error(
      reasons.length > 0
        ? reasons.join(" ")
        : "e-Invoice push was rejected (Zoho gave no specific reason)."
    );
  }

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
  // pushEInvoice's own "failed" case throws before this is ever called, so
  // this branch only fires for getEinvoiceStatus's passive read — but a
  // passive read can just as well find a genuinely failed status (e.g.
  // Zoho finished processing an earlier attempt after our synchronous
  // check gave up), so it needs to be reported as such here too, not
  // silently folded into "pending".
  const failed = !pushed.irn && pushed.status === "failed";
  return {
    einvoiceStatus: pushed.irn
      ? ("pushed" as const)
      : failed
        ? ("failed" as const)
        : ("pending" as const),
    irn: pushed.irn,
    ackNo: pushed.ackNumber,
    ackDate: pushed.ackDate ? new Date(pushed.ackDate) : null,
    // Zoho's `qr_link` is a hosted QR *image* URL, not the raw signed QR
    // payload string the government schema technically defines — it's what
    // Zoho's API actually gives back, so it's what's stored here.
    signedQr: pushed.qrLink,
    einvoiceRaw: JSON.stringify(pushed.raw),
    einvoiceError: failed
      ? (Array.isArray(pushed.raw.failure_list) ? pushed.raw.failure_list.join(" ") : null)
      : null,
  };
}

/**
 * Read-only: what Zoho currently has on file for this invoice's
 * e-invoice, without pushing anything. For reconciling a status that
 * changed on Zoho's side without going through our own push — e.g.
 * someone used Zoho's own UI, or a push's real outcome only became
 * visible in Zoho after our synchronous check already gave up.
 */
export async function getEinvoiceStatus(zohoInvoiceId: string): Promise<PushResult> {
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
