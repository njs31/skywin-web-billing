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

// ---- UPI QR for a field order (Razorpay UPI payment link) --------------------------------
//
// Razorpay's QR Codes API is an on-demand feature that is not on for this account. A UPI
// payment link is: its short URL redirects to a `upi://pay?…` request for SkyWin with its own
// transaction reference, which the app draws as a QR any UPI app can scan.

export type PaymentLinkPayment = { payment_id?: string; status?: string; amount?: number };

export type PaymentLink = {
  id: string;
  status?: string;
  amount?: number;
  amount_paid?: number;
  short_url?: string;
  reference_id?: string;
  expire_by?: number;
  notes?: Record<string, string> | unknown[];
  payments?: PaymentLinkPayment[] | null;
};

async function paymentLinkFetch(path: string, init?: RequestInit) {
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
  const data = (await res.json()) as PaymentLink & { error?: { description?: string } };
  if (!res.ok || !data.id) throw new Error(data.error?.description || "Razorpay could not make the UPI QR.");
  return data;
}

export function paymentLinkNotes(link: Pick<PaymentLink, "notes">): Record<string, string> {
  return link.notes && !Array.isArray(link.notes) ? (link.notes as Record<string, string>) : {};
}

/** A single-payment UPI link for exactly `amountPaise`. Nothing is sent to the customer. */
export async function createUpiPaymentLink(input: {
  amountPaise: number;
  referenceId: string;
  description: string;
  expireBy: number;
  notes: Record<string, string>;
}) {
  return paymentLinkFetch("/payment_links", {
    method: "POST",
    body: JSON.stringify({
      amount: Math.round(input.amountPaise),
      currency: "INR",
      accept_partial: false,
      upi_link: true,
      description: input.description.slice(0, 2048),
      reference_id: input.referenceId.slice(0, 40),
      expire_by: Math.floor(input.expireBy),
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: input.notes,
    }),
  });
}

export async function getPaymentLink(linkId: string) {
  return paymentLinkFetch(`/payment_links/${encodeURIComponent(linkId)}`);
}

export async function cancelPaymentLink(linkId: string) {
  return paymentLinkFetch(`/payment_links/${encodeURIComponent(linkId)}/cancel`, { method: "POST" });
}

/** The captured payment on a paid link, if any. */
export function paidLinkPayment(link: PaymentLink) {
  return (link.payments ?? []).find((p) => p.status === "captured" && p.payment_id) ?? null;
}

/**
 * Follows the link's short URL the way a phone would and returns the `upi://pay?…` request it
 * ends on. The QR holds this string, so scanning it opens the payment straight in the UPI app.
 */
export async function upiIntentForLink(shortUrl: string) {
  let url = shortUrl;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36" },
      signal: AbortSignal.timeout(15000),
    });
    const next = res.headers.get("location");
    if (!next) break;
    url = new URL(next, url).toString();
    if (url.startsWith("upi://")) return url;
  }
  throw new Error("Razorpay did not return a UPI payment request.");
}
