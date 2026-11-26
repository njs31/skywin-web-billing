import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { placeFieldOrder } from "@/lib/queries/field-orders";
import { priceFieldLines, unpackCart } from "@/lib/field-order-pricing";
import { captureVerifiedPayment, paidQrCodePayment } from "@/lib/payments/razorpay";
import { notifyLater, peopleForSale, pushCopy } from "@/lib/field-push";
import { refundUnfillableOrder, releaseHolds, STOCK_UNAVAILABLE } from "@/lib/stock-holds";
import { shippingOnRazorpayOrder } from "@/lib/field-shipping";

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
    /** qr_code.credited: the officer's UPI QR (QR Codes API) was paid. Its notes carry the field order. */
    qr_code?: { entity?: { id?: string; notes?: Record<string, string> | unknown[] } };
    /** payment_link.paid: an older payment-link QR was paid. Its notes carry the field order. */
    payment_link?: { entity?: { id?: string; notes?: Record<string, string> | unknown[] } };
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
 * events payment.authorized, payment.captured, payment.failed, qr_code.credited (officer's UPI
 * QR payments) and payment_link.paid (older QRs), secret = RAZORPAY_WEBHOOK_SECRET.
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
  const payment = event.payload?.payment?.entity;
  const link = event.payload?.payment_link?.entity ?? event.payload?.qr_code?.entity;
  const notesFrom = (n: unknown) => (n && !Array.isArray(n) && typeof n === "object" ? (n as Record<string, string>) : {});
  // A QR payment's own notes may be empty; the paid QR's notes always carry the order.
  const notes = { ...notesFrom(link?.notes), ...notesFrom(payment?.notes) };
  const orderId = String(notes.fieldOrder || "");
  // The Razorpay order the server priced (delivery charge). A QR payment sits on the link's own order.
  const pricedOrderId = notes.rzpOrder || payment?.order_id;

  // A failed payment gives its held stock back at once instead of after the hold expires.
  if (event.event === "payment.failed") {
    if (orderId) await releaseHolds(orderId);
    return NextResponse.json({ ok: true, released: !!orderId });
  }
  const handled = ["payment.authorized", "payment.captured", "payment_link.paid", "qr_code.credited"];
  if (!handled.includes(String(event.event))) {
    return NextResponse.json({ ok: true, ignored: event.event });
  }
  // A QR Codes payment has no Razorpay order; every other field payment does.
  if (!payment?.id || !orderId || (!payment.order_id && event.event !== "qr_code.credited")) {
    return NextResponse.json({ ok: true, ignored: "not a field order" });
  }

  const lines = unpackCart(notes.cart);
  if (!lines.length) {
    // Paid by an older app that did not store the cart. Staff must match it by hand.
    console.error("[field/pay/webhook] paid field order without cart", { orderId, paymentId: payment.id, amount: payment.amount });
    return NextResponse.json({ ok: true, needsReview: true });
  }

  try {
    if (event.event === "payment.authorized" && payment.order_id) {
      await captureVerifiedPayment({ orderId: payment.order_id, paymentId: payment.id });
    }
    if (event.event === "qr_code.credited" && payment.status !== "captured") {
      // Only a captured QR payment is kept as a sale.
      const qrId = event.payload?.qr_code?.entity?.id;
      const paid = qrId ? await paidQrCodePayment(qrId) : null;
      if (paid?.id !== payment.id) return NextResponse.json({ error: "QR payment not captured yet" }, { status: 500 });
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
      razorpayOrderId: pricedOrderId,
      items: priced.lines,
      // The delivery charge the server priced rides on the notes (order, or the QR made with it).
      shippingAmount:
        notes.ship != null && notes.ship !== "" && Number.isFinite(Number(notes.ship))
          ? Number(notes.ship)
          : (await shippingOnRazorpayOrder(pricedOrderId))?.amount ?? 0,
    });
    if (!result.duplicate) {
      console.warn("[field/pay/webhook] created sale the app did not save", { orderId, saleId: result.saleId });
      const amount = (Number(payment.amount) || 0) / 100;
      const who = await peopleForSale({ saleId: result.saleId });
      if (who) {
        notifyLater([who.farmerPhone], pushCopy.orderPlacedForFarmer(who.ref, amount));
        if (who.officerPhone) notifyLater([who.officerPhone], pushCopy.orderPlacedForOfficer(who.ref, who.farmerName || "Farmer", amount));
      }
    }
    return NextResponse.json({ ok: true, saleId: result.saleId, duplicate: result.duplicate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (STOCK_UNAVAILABLE.test(msg)) {
      // Paid but the stock is gone: refund once (shared with the app's save), don't retry.
      const refund = await refundUnfillableOrder({
        orderId,
        paymentId: payment.id,
        phone: String(notes.phone || "").replace(/\D/g, "").slice(-10) || null,
        reason: msg,
      });
      console.warn("[field/pay/webhook] paid order out of stock", { orderId, refunded: refund.refunded });
      if (refund.refunded || refund.alreadyHandled) return NextResponse.json({ ok: true, refunded: refund.refunded });
    }
    // A non-2xx makes Razorpay retry for up to 24 hours.
    console.error("[field/pay/webhook] could not save paid order", { orderId, paymentId: payment.id, err });
    return NextResponse.json({ error: "Could not save order" }, { status: 500 });
  }
}
