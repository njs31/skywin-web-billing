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
