import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldAppUserByPhone, fieldOfficerSeesOwnFarmers } from "@/lib/field-officer-scope";
import { listFieldOrders, placeFieldOrder } from "@/lib/queries/field-orders";
import { fieldIdentity, legacyFieldKeyAllowed } from "@/lib/field-auth";
import { priceFieldLines } from "@/lib/field-order-pricing";
import { getPaymentLink, getRazorpayPayment, paidLinkPayment, paymentLinkNotes } from "@/lib/payments/razorpay";
import { upiQrOwnedBy } from "@/lib/field-upi-qr";
import { notifyLater, peopleForSale, pushCopy } from "@/lib/field-push";
import { refundUnfillableOrder, STOCK_UNAVAILABLE } from "@/lib/stock-holds";
import { shippingOnRazorpayOrder } from "@/lib/field-shipping";

/** The farmer hears about an order someone placed for them; their officer hears about every new order. */
async function notifyNewOrder(saleId: number, amount: number, placedBy: string | undefined) {
  const who = await peopleForSale({ saleId });
  if (!who) return;
  if (who.farmerPhone && who.farmerPhone !== placedBy) {
    notifyLater([who.farmerPhone], pushCopy.orderPlacedForFarmer(who.ref, amount));
  }
  if (who.officerPhone && who.officerPhone !== placedBy) {
    notifyLater([who.officerPhone], pushCopy.orderPlacedForOfficer(who.ref, who.farmerName || "Farmer", amount));
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fieldOrderErrorMessage(err: unknown) {
  let current: unknown = err;
  let last = err instanceof Error ? err.message : "Failed to place field order";
  for (let i = 0; current && i < 8; i++) {
    const e = current as {
      message?: string;
      code?: string;
      detail?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (e.code && /^\d{5}$/.test(String(e.code))) {
      return [e.code, e.constraint, e.detail || e.message].filter(Boolean).join(" · ");
    }
    if (e.detail) last = e.detail;
    else if (e.message && !e.message.startsWith("Failed query")) last = e.message;
    current = e.cause;
  }
  return last;
}

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }
  const who = fieldIdentity(req);
  // A signed-in farmer gets only their own orders (matched on their signed-in phone), so
  // every order they pay for shows on My orders. Signed-in staff are scoped by their own phone.
  if (who?.role === "farmer") {
    try {
      return fieldJson(await listFieldOrders({ farmerPhone: who.phone }));
    } catch (err) {
      return fieldJson({ error: err instanceof Error ? err.message : "Failed to list field orders" }, 500);
    }
  }
  const viewerPhone = who ? who.phone : req.nextUrl.searchParams.get("viewer") || "";
  try {
    let officerId: number | undefined;
    if (viewerPhone.trim()) {
      const viewer = await fieldAppUserByPhone(viewerPhone);
      if (!viewer) return fieldJson({ orders: [], todayCount: 0, todayTotal: 0, monthCount: 0, monthTotal: 0 });
      if (fieldOfficerSeesOwnFarmers(viewer.role)) officerId = viewer.id;
    }
    const data = await listFieldOrders(officerId ? { officerId } : undefined);
    return fieldJson(data);
  } catch (err) {
    return fieldJson(
      { error: err instanceof Error ? err.message : "Failed to list field orders" },
      500
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }

  const who = fieldIdentity(req);
  // Known once the payment is checked: a paid order that can't be billed is refunded.
  let paid: { orderId: string; paymentId: string; phone: string } | null = null;
  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    // Identity comes from the login token when there is one, never from the request body.
    const farmerPhone = who?.role === "farmer" ? who.phone : String(body.farmerPhone || body.phone || "");
    const officerPhone = who
      ? who.role === "farmer" ? undefined : who.phone
      : body.officerPhone ? String(body.officerPhone) : undefined;

    // Prices come from the server. A client rate below the legitimate price is replaced.
    const priced = await priceFieldLines(
      items.map((item: Record<string, unknown>) => ({
        productId: Number(item.productId),
        batchId: item.batchId == null || item.batchId === "" ? null : Number(item.batchId),
        qty: Number(item.qty) || 1,
        rate: item.rate != null ? Number(item.rate) : undefined,
      }))
    );

    // The Razorpay payment must exist, belong to this order and cover the goods.
    const paymentId = body.razorpayPaymentId ? String(body.razorpayPaymentId) : "";
    let paidAmount = Number(body.paidAmount ?? body.total) || 0;
    let shippingAmount = 0;
    if (paymentId) {
      const payment = (await getRazorpayPayment(paymentId)) as { amount?: number; status?: string; order_id?: string };
      // Paid by scanning the officer's UPI QR: the payment sits on the QR's own Razorpay order,
      // so it is matched through the QR (same payment, same field order, same person) instead.
      const linkId = body.paymentLinkId ? String(body.paymentLinkId) : "";
      let pricedOrderId = payment.order_id;
      // Delivery charge the server priced, carried on the QR itself (set when the QR was made).
      let qrShipping: number | null = null;
      if (linkId) {
        const link = await getPaymentLink(linkId);
        const notes = paymentLinkNotes(link);
        const ok =
          paidLinkPayment(link)?.payment_id === paymentId &&
          notes.fieldOrder === String(body.orderId || body.id || "") &&
          (!body.razorpayOrderId || !notes.rzpOrder || notes.rzpOrder === String(body.razorpayOrderId)) &&
          (!who || upiQrOwnedBy(notes, who));
        if (!ok) return fieldJson({ success: false, error: "Payment does not match this order." }, 400);
        pricedOrderId = notes.rzpOrder;
        const ship = Number(notes.ship);
        qrShipping = notes.ship != null && Number.isFinite(ship) && ship >= 0 ? ship : notes.rzpOrder ? null : 0;
      } else if (body.razorpayOrderId && payment.order_id && payment.order_id !== String(body.razorpayOrderId)) {
        return fieldJson({ success: false, error: "Payment does not match this order." }, 400);
      }
      if (payment.status !== "captured" && payment.status !== "authorized") {
        return fieldJson({ success: false, error: "Payment is not complete." }, 402);
      }
      paidAmount = (Number(payment.amount) || 0) / 100;
      paid = {
        orderId: String(body.orderId || body.id || ""),
        paymentId,
        phone: farmerPhone.replace(/\D/g, "").slice(-10),
      };
      // Delivery the server priced at payment start goes on the invoice.
      shippingAmount = qrShipping ?? (await shippingOnRazorpayOrder(pricedOrderId))?.amount ?? 0;
      // Reward points are not redeemed in the app (nothing deducts them), so the full price is due.
      if (paidAmount + 1 < priced.minimumTotal + shippingAmount) {
        console.error("[field/orders] underpaid", { orderId: body.orderId, paymentId, paidAmount, minimum: priced.minimumTotal + shippingAmount });
        return fieldJson({ success: false, error: "The payment is less than the order total. SkyWin will refund it." }, 402);
      }
    } else if (who || !legacyFieldKeyAllowed()) {
      return fieldJson({ success: false, error: "Payment is required." }, 402);
    }

    const result = await placeFieldOrder({
      orderId: String(body.orderId || body.id || ""),
      farmerName: String(body.farmerName || body.farmer || ""),
      farmerPhone,
      officerName: String(body.officerName || body.officer || ""),
      officerPhone,
      deliveryDate: body.deliveryDate ? String(body.deliveryDate) : undefined,
      note: body.note ? String(body.note) : undefined,
      placedGps: body.placedGps ? String(body.placedGps) : undefined,
      paidAmount,
      razorpayPaymentId: paymentId || undefined,
      razorpayOrderId: body.razorpayOrderId ? String(body.razorpayOrderId) : undefined,
      items: priced.lines,
      shippingAmount,
    });
    if (!result.duplicate) {
      void notifyNewOrder(result.saleId, paidAmount, who?.phone);
    }
    return fieldJson(result);
  } catch (err) {
    const msg = fieldOrderErrorMessage(err);
    console.error("[field/orders]", msg);
    const unavailable = STOCK_UNAVAILABLE.test(msg);
    if (unavailable && paid?.orderId) {
      // Paid, but the stock is gone (the hold ran out and it sold): never keep the money.
      const refund = await refundUnfillableOrder({ ...paid, reason: msg });
      return fieldJson(
        {
          success: false,
          refunded: refund.refunded,
          error: refund.refunded
            ? "Sorry, an item sold out while you were paying. Your full payment is being refunded (5–7 days). You have not been charged for this order."
            : "An item sold out while you were paying. SkyWin will refund your payment; please call us if you don't get it.",
        },
        409
      );
    }
    return fieldJson(
      {
        success: false,
        error: unavailable
          ? "This batch is no longer available. Search again."
          : msg,
      },
      unavailable ? 409 : 400
    );
  }
}
