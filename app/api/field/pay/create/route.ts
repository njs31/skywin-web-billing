import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { cleanMobile, clientIp, fieldIdentity, legacyFieldKeyAllowed, rateLimited } from "@/lib/field-auth";
import { packCart, priceFieldLines, type FieldLineIn } from "@/lib/field-order-pricing";
import { officerMayServeFarmer } from "@/lib/field-order-access";
import { cancelPaymentLink, createRazorpayOrder } from "@/lib/payments/razorpay";
import { makeUpiQr } from "@/lib/field-upi-qr-make";
import { placeStockHolds, releaseHolds } from "@/lib/stock-holds";
import { quoteOrderShipping } from "@/lib/field-shipping";
import { productsHiddenInApp } from "@/lib/field-listed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

/**
 * Starts a Razorpay payment for a field order.
 * With `items`, the server prices the cart and refuses an amount below what the goods cost
 * (less the farmer's reward points). The cart is saved on the Razorpay order so the webhook
 * can still create the sale if the phone never comes back.
 *
 * Before any money moves, the cart's stock is checked against live stock (less other
 * customers' holds) and held for this order (lib/stock-holds.ts). If something sold out,
 * the reply is 409 with `unavailable`, listing each short line, and no payment starts.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const who = fieldIdentity(req);
  try {
    const body = (await req.json()) as {
      amount?: number;
      orderId?: string;
      farmerName?: string;
      farmerPhone?: string;
      items?: FieldLineIn[];
      /** Delivery PIN: the server prices delivery itself and puts it on the invoice. */
      shipPin?: string;
      /** Officer collecting in person: also make the UPI QR in this reply. */
      qr?: boolean;
    };
    const rupees = Number(body.amount);
    if (!Number.isFinite(rupees) || rupees < 1) return fieldJson({ error: "Invalid amount" }, 400);
    const receipt = String(body.orderId || `SW-${Date.now()}`).slice(0, 40);
    const farmerPhone = who?.role === "farmer" ? who.phone : cleanMobile(body.farmerPhone);
    const items = Array.isArray(body.items) ? body.items : [];
    // Each payment start holds stock for 15 minutes, so one phone can't start them endlessly.
    if (rateLimited(`pay-create:${who?.phone || clientIp(req)}`, 15, 10 * 60 * 1000)) {
      return fieldJson({ error: "Too many payment attempts. Wait a few minutes and try again." }, 429);
    }
    // Checked before payment: billing would refuse (and refund) an order for another officer's farmer.
    const notYours = await officerMayServeFarmer(who, farmerPhone);
    if (notYours) return fieldJson({ error: notYours }, 409);

    let cart: string | null = null;
    let holdExpiresAt: string | null = null;
    let shipping: { amount: number; pin: string } | null = null;
    if (items.length) {
      // Products switched off in the app (Product details → In app) can't be bought any more,
      // even from a cart filled before the switch.
      const hidden = await productsHiddenInApp(items.map((item) => Number(item.productId)));
      if (hidden.length) {
        return fieldJson(
          {
            error: `${hidden.map((h) => h.name).join(", ")} ${hidden.length === 1 ? "is" : "are"} no longer available. Remove ${hidden.length === 1 ? "it" : "them"} from your cart and try again.`,
            // Same shape as a stock shortage, so the app lists these lines the same way.
            unavailable: items
              .filter((item) => hidden.some((h) => h.productId === Number(item.productId)))
              .map((item) => ({
                productId: Number(item.productId),
                batchId: item.batchId == null || (item.batchId as unknown) === "" ? null : Number(item.batchId),
                name: hidden.find((h) => h.productId === Number(item.productId))?.name ?? "Item",
                requested: Math.max(1, Math.floor(Number(item.qty) || 1)),
                available: 0,
              })),
          },
          409
        );
      }
      const priced = await priceFieldLines(items);
      const shipPin = String(body.shipPin || "").replace(/\D/g, "").slice(0, 6);
      if (shipPin.length === 6) {
        // Older apps don't send the PIN; they keep paying the delivery they were quoted.
        const quote = await quoteOrderShipping(shipPin, priced.lines);
        shipping = { amount: quote.amount, pin: quote.pin };
      }
      // Reward points are not redeemed in the app (nothing deducts them), so the full price is due.
      const minimum = Math.max(1, priced.minimumTotal + (shipping?.amount ?? 0));
      if (rupees + 1 < minimum) {
        return fieldJson(
          { error: "The order total or delivery charge changed. Go back to the cart, check the total and try again." },
          400
        );
      }
      cart = packCart(priced.lines);
      const held = await placeStockHolds({
        holdKey: receipt,
        ownerPhone: who?.phone || farmerPhone || null,
        lines: priced.lines.map((l) => ({ productId: l.productId, batchId: l.batchId, qty: l.qty })),
      });
      if (!held.ok) {
        return fieldJson(
          {
            error: "Some items sold out or have less stock now. Update your cart and try again.",
            unavailable: held.shortages,
          },
          409
        );
      }
      holdExpiresAt = held.expiresAt.toISOString();
    } else if (who || !legacyFieldKeyAllowed()) {
      // Signed-in apps always send the cart; only old builds may omit it.
      return fieldJson({ error: "Cart items are required." }, 400);
    }

    const notes: Record<string, string> = {
      fieldOrder: receipt,
      farmer: String(body.farmerName || "").slice(0, 120),
      phone: farmerPhone,
      ...(who && who.role !== "farmer" ? { officerPhone: who.phone } : {}),
      ...(cart ? { cart } : {}),
      ...(shipping ? { ship: String(shipping.amount), pin: shipping.pin } : {}),
    };
    const amountPaise = Math.round(rupees * 100);
    const startedAt = Date.now();
    // An officer collecting in person also gets the UPI QR in this same reply, made at the same
    // time as the Razorpay order (one trip from the phone instead of two). A QR that fails
    // doesn't stop the payment: the app can still ask /api/field/pay/qr or pay in Razorpay.
    const wantQr = !!body.qr && !!who && who.role !== "farmer" && amountPaise >= 100;
    const qrPromise = wantQr
      ? makeUpiQr({ amountPaise, fieldOrder: receipt, notes }).then(
          (qr) => ({ qr, error: null as string | null }),
          (err: unknown) => ({ qr: null, error: err instanceof Error ? err.message : "Could not make the UPI QR." })
        )
      : null;

    let order: Awaited<ReturnType<typeof createRazorpayOrder>>;
    try {
      order = await createRazorpayOrder({ amountPaise, receipt, notes });
    } catch (err) {
      // No payment started: give the stock back and close the QR straight away.
      if (holdExpiresAt) await releaseHolds(receipt);
      const made = await qrPromise;
      if (made?.qr) await cancelPaymentLink(made.qr.linkId).catch(() => undefined);
      throw err;
    }
    const orderMs = Date.now() - startedAt;
    const made = await qrPromise;
    if (wantQr) {
      console.info("[field/pay/create] timings", {
        receipt,
        orderMs,
        qrMs: Date.now() - startedAt,
        qrSteps: made?.qr?.timings ?? null,
        qrError: made?.error ?? null,
      });
    }
    return fieldJson({
      keyId: order.keyId,
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt,
      holdExpiresAt,
      ...(made?.qr
        ? { qr: { linkId: made.qr.linkId, upi: made.qr.upi, amount: amountPaise, expiresAt: made.qr.expiresAt } }
        : {}),
      ...(made?.error ? { qrError: made.error } : {}),
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not start payment" }, 400);
  }
}
