import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { placeFieldOrder } from "@/lib/queries/field-orders";
import { priceFieldLines, unpackCart } from "@/lib/field-order-pricing";
import { captureVerifiedPayment } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayEvent = {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        status?: string;
        notes?: Record<string, string> | unknown[];
      };
    };
  };
};

function signatureOk(raw: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Razorpay → server. Makes sure every paid field order becomes a sale, even when the phone
 * closed, lost signal or crashed between paying and saving.
 *
 * Razorpay dashboard → Webhooks: URL https://<billing host>/api/field/pay/webhook,
 * events payment.authorized and payment.captured, secret = RAZORPAY_WEBHOOK_SECRET.
 * Sales are unique by field order id, so this and the app saving the same order never
 * create two sales.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (event.event !== "payment.authorized" && event.event !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const payment = event.payload?.payment?.entity;
  const notes = (payment?.notes && !Array.isArray(payment.notes) ? payment.notes : {}) as Record<string, string>;
  const orderId = String(notes.fieldOrder || "");
  if (!payment?.id || !payment.order_id || !orderId) {
    return NextResponse.json({ ok: true, ignored: "not a field order" });
  }

  const lines = unpackCart(notes.cart);
  if (!lines.length) {
    // Paid by an older app that did not store the cart. Staff must match it by hand.
    console.error("[field/pay/webhook] paid field order without cart", { orderId, paymentId: payment.id, amount: payment.amount });
    return NextResponse.json({ ok: true, needsReview: true });
  }

  try {
    if (event.event === "payment.authorized") {
      await captureVerifiedPayment({ orderId: payment.order_id, paymentId: payment.id });
    }
    const priced = await priceFieldLines(lines);
    const result = await placeFieldOrder({
      orderId,
      farmerName: String(notes.farmer || "Farmer"),
      farmerPhone: String(notes.phone || ""),
      officerName: notes.officerPhone ? "Field officer" : "Farmer",
      officerPhone: notes.officerPhone || undefined,
      note: "Saved from Razorpay webhook",
      paidAmount: (Number(payment.amount) || 0) / 100,
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      items: priced.lines,
    });
    if (!result.duplicate) {
      console.warn("[field/pay/webhook] created sale the app did not save", { orderId, saleId: result.saleId });
    }
    return NextResponse.json({ ok: true, saleId: result.saleId, duplicate: result.duplicate });
  } catch (err) {
    // A non-2xx makes Razorpay retry for up to 24 hours.
    console.error("[field/pay/webhook] could not save paid order", { orderId, paymentId: payment.id, err });
    return NextResponse.json({ error: "Could not save order" }, { status: 500 });
  }
}
