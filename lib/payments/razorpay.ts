import { createHmac, timingSafeEqual } from "node:crypto";

export function razorpayKeys() {
  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  return { keyId, keySecret };
}

export async function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const { keyId, keySecret } = razorpayKeys();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured on the server.");
  if (!Number.isFinite(input.amountPaise) || input.amountPaise < 100) {
    throw new Error("Amount must be at least ₹1.");
  }

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(input.amountPaise),
      currency: "INR",
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    }),
  });
  const data = (await res.json()) as {
    id?: string;
    amount?: number;
    currency?: string;
    error?: { description?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(data.error?.description || "Could not create Razorpay order");
  }
  return { id: data.id, amount: Number(data.amount), currency: data.currency || "INR", keyId };
}

export function verifyRazorpaySignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const { keySecret } = razorpayKeys();
  if (!keySecret) return false;
  const expected = createHmac("sha256", keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

type RazorpayPayment = {
  id?: string;
  amount?: number;
  amount_refunded?: number;
  currency?: string;
  status?: string;
  order_id?: string;
  payment_id?: string;
  error?: { description?: string };
};

async function razorpayFetch(path: string, init?: RequestInit, fallback = "Could not confirm the Razorpay payment.") {
  const { keyId, keySecret } = razorpayKeys();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured on the server.");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as RazorpayPayment;
  if (!res.ok || (init?.method === "POST" && !data.id)) {
    throw new Error(data.error?.description || fallback);
  }
  return data;
}

export async function getRazorpayPayment(paymentId: string) {
  return razorpayFetch(`/payments/${encodeURIComponent(paymentId)}`);
}

/** The Razorpay order (its notes carry the cart and delivery charge the server priced). */
export async function getRazorpayOrder(orderId: string) {
  return razorpayFetch(`/orders/${encodeURIComponent(orderId)}`);
}

/** Full or partial refund of a captured payment. Amount is in paise. */
export async function refundRazorpayPayment(input: {
  paymentId: string;
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  if (!Number.isFinite(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }
  return razorpayFetch(
    `/payments/${encodeURIComponent(input.paymentId)}/refund`,
    {
      method: "POST",
      body: JSON.stringify({
        amount: Math.round(input.amountPaise),
        speed: "normal",
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
      }),
    },
    "Could not refund this Razorpay payment."
  );
}

/** Signature-checked payments must be captured before the field sale reduces stock. */
export async function captureVerifiedPayment(input: { orderId: string; paymentId: string }) {
  const payment = await razorpayFetch(`/payments/${encodeURIComponent(input.paymentId)}`);
  if (payment.order_id && payment.order_id !== input.orderId) {
    throw new Error("Payment does not match this order.");
  }
  if (payment.status === "captured") return payment;
  if (payment.status !== "authorized") {
    throw new Error(`Payment is ${payment.status || "not complete"}.`);
  }
  return razorpayFetch(`/payments/${encodeURIComponent(input.paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount: payment.amount, currency: payment.currency || "INR" }),
  });
}

// ---- UPI QR for a field order (Razorpay QR Codes API) ------------------------------------
//
// https://razorpay.com/docs/api/qr-codes : a single-use, fixed-amount `upi_qr` per field order.
// Razorpay closes it by itself once it is paid (close_reason "paid") or at `close_by`.

export type QrCode = {
  id: string;
  entity?: string;
  status?: string;
  image_url?: string;
  payment_amount?: number;
  payments_amount_received?: number;
  payments_count_received?: number;
  close_by?: number | string;
  closed_at?: number | null;
  close_reason?: string | null;
  notes?: Record<string, string> | unknown[];
};

export type QrCodePayment = {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  order_id?: string | null;
  method?: string;
};

async function qrFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { keyId, keySecret } = razorpayKeys();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured on the server.");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(data.error?.description || "Razorpay could not make the UPI QR.");
  return data;
}

export function qrCodeNotes(qr: Pick<QrCode, "notes">): Record<string, string> {
  return qr.notes && !Array.isArray(qr.notes) ? (qr.notes as Record<string, string>) : {};
}

/** POST /payments/qr_codes: one payment of exactly `amountPaise`, open until `closeBy` (Unix seconds). */
export async function createUpiQrCode(input: {
  amountPaise: number;
  name: string;
  description: string;
  closeBy: number;
  notes: Record<string, string>;
}) {
  const qr = await qrFetch<QrCode>("/payments/qr_codes", {
    method: "POST",
    body: JSON.stringify({
      type: "upi_qr",
      name: input.name.slice(0, 120),
      usage: "single_use",
      fixed_amount: true,
      payment_amount: Math.round(input.amountPaise),
      description: input.description.slice(0, 2048),
      close_by: Math.floor(input.closeBy),
      notes: input.notes,
    }),
  });
  if (!qr.id || !qr.image_url) throw new Error("Razorpay could not make the UPI QR.");
  return qr;
}

/** GET /payments/qr_codes/:id */
export async function getQrCode(qrId: string) {
  return qrFetch<QrCode>(`/payments/qr_codes/${encodeURIComponent(qrId)}`);
}

/** POST /payments/qr_codes/:id/close */
export async function closeQrCode(qrId: string) {
  return qrFetch<QrCode>(`/payments/qr_codes/${encodeURIComponent(qrId)}/close`, { method: "POST" });
}

/**
 * The money paid on a QR (GET /payments/qr_codes/:id/payments), or null. A payment Razorpay
 * only authorized is captured here, so it counts the same as one captured straight away.
 */
export async function paidQrCodePayment(qrId: string) {
  const list = await qrFetch<{ items?: QrCodePayment[] }>(
    `/payments/qr_codes/${encodeURIComponent(qrId)}/payments?count=10`
  );
  const items = list.items ?? [];
  const captured = items.find((p) => p.status === "captured" && p.id);
  if (captured) return captured;
  const authorized = items.find((p) => p.status === "authorized" && p.id);
  if (!authorized?.id) return null;
  const done = await razorpayFetch(`/payments/${encodeURIComponent(authorized.id)}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount: authorized.amount, currency: authorized.currency || "INR" }),
  });
  return { ...authorized, status: done.status || "captured" };
}

// ---- Older UPI QRs (Razorpay UPI payment links), before the QR Codes API ------------------
// Only read now: a QR shown by an app from before the switch can still be paid for a few
// minutes, and its order must still save.

export type PaymentLinkPayment = { payment_id?: string; status?: string; amount?: number };

export type PaymentLink = {
  id: string;
  status?: string;
  notes?: Record<string, string> | unknown[];
  payments?: PaymentLinkPayment[] | null;
};

export async function getPaymentLink(linkId: string) {
  return qrFetch<PaymentLink>(`/payment_links/${encodeURIComponent(linkId)}`);
}

export function paymentLinkNotes(link: Pick<PaymentLink, "notes">): Record<string, string> {
  return link.notes && !Array.isArray(link.notes) ? (link.notes as Record<string, string>) : {};
}

/** The captured payment on a paid link, if any. */
export function paidLinkPayment(link: PaymentLink) {
  return (link.payments ?? []).find((p) => p.status === "captured" && p.payment_id) ?? null;
}
