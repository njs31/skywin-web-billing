/**
 * Stock holds for Field app checkouts.
 *
 * 1. When a customer taps Pay, placeStockHolds() locks the products, checks live stock less
 *    everyone else's holds, and holds the cart for HOLD_MINUTES. If anything is short, no
 *    payment starts and the app is told exactly what changed.
 * 2. Every sale (POS counter, Field app, Qwicks) subtracts other orders' holds from stock
 *    (lockProductsWithBatches), so held units cannot be sold elsewhere meanwhile.
 * 3. The order's sale uses its own holds and marks them consumed in the same commit.
 * 4. If a paid order still cannot be billed (e.g. the hold expired and the stock was sold),
 *    refundUnfillableOrder() refunds the payment once and tells the customer.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { fieldUnfilledOrders, sales, stockHolds } from "@/db/schema";
import { lockProductsWithBatches } from "@/lib/queries/sales";
import { activeHolds, findShortages, HOLD_MINUTES, type CartLine, type Shortage } from "@/lib/stock-holds-core";
import { getRazorpayPayment, refundRazorpayPayment } from "@/lib/payments/razorpay";
import { notifyLater } from "@/lib/field-push";

export { HOLD_MINUTES, type Shortage } from "@/lib/stock-holds-core";

/** Stock errors from createSale that mean "the goods are not there", not a bug. */
export const STOCK_UNAVAILABLE = /out of stock|insufficient (stock|qty)|does not belong to this product|requested quantity exceeds/i;

function mergeLines(lines: CartLine[]) {
  const merged = new Map<string, CartLine>();
  for (const line of lines) {
    const key = `${line.productId}:${line.batchId ?? ""}`;
    const current = merged.get(key);
    if (current) current.qty += line.qty;
    else merged.set(key, { ...line });
  }
  return [...merged.values()];
}

/**
 * Holds the cart's stock for `holdKey` (the field order id). Releases the same phone's older
 * holds first, so a customer who cancelled and tries again isn't blocked by their own cart.
 */
export async function placeStockHolds(input: {
  holdKey: string;
  ownerPhone: string | null;
  lines: CartLine[];
}): Promise<{ ok: true; expiresAt: Date } | { ok: false; shortages: Shortage[] }> {
  const lines = mergeLines(input.lines.filter((l) => l.qty > 0));
  const productIds = [...new Set(lines.map((l) => l.productId))].sort((a, b) => a - b);
  return db.transaction(async (tx) => {
    if (input.ownerPhone) {
      await tx
        .update(stockHolds)
        .set({ status: "released" })
        .where(and(eq(stockHolds.ownerPhone, input.ownerPhone), eq(stockHolds.status, "active")));
    }
    // The order id comes from the phone; never touch a hold another customer owns under it.
    const [taken] = await tx
      .select({ owner: stockHolds.ownerPhone })
      .from(stockHolds)
      .where(and(eq(stockHolds.holdKey, input.holdKey), eq(stockHolds.status, "active")))
      .limit(1);
    if (taken && taken.owner !== input.ownerPhone) {
      throw new Error("This order number is already in use. Please try again.");
    }
    await tx
      .update(stockHolds)
      .set({ status: "released" })
      .where(and(eq(stockHolds.holdKey, input.holdKey), eq(stockHolds.status, "active")));

    // Same lock every seller takes: the stock read below can't change until we commit.
    const productInfo = await lockProductsWithBatches(tx, productIds, { ownHoldKey: input.holdKey });
    const shortages = findShortages(productInfo, lines);
    if (shortages.length) return { ok: false as const, shortages };

    // Expiry is computed by the database clock, the same clock every check compares against.
    const inserted = await tx
      .insert(stockHolds)
      .values(
        lines.map((line) => ({
          holdKey: input.holdKey,
          ownerPhone: input.ownerPhone,
          productId: line.productId,
          batchId: line.batchId,
          qty: line.qty.toFixed(2),
          expiresAt: sql`now() + make_interval(mins => ${HOLD_MINUTES})`,
        }))
      )
      .returning({ expiresAt: stockHolds.expiresAt });
    return { ok: true as const, expiresAt: inserted[0]!.expiresAt };
  });
}

/** Gives an order's held stock back (payment failed or could not start). */
export async function releaseHolds(holdKey: string) {
  await db
    .update(stockHolds)
    .set({ status: "released" })
    .where(and(eq(stockHolds.holdKey, holdKey), eq(stockHolds.status, "active")));
}

/** Quantity held by checkouts in progress, per product and per batch, for stock shown to buyers. */
export async function heldTotals(productIds: number[]) {
  const holds = await activeHolds(db, productIds);
  const byProduct = new Map<number, number>();
  const byBatch = new Map<number, number>();
  for (const h of holds) {
    byProduct.set(h.productId, (byProduct.get(h.productId) ?? 0) + h.qty);
    if (h.batchId != null) byBatch.set(h.batchId, (byBatch.get(h.batchId) ?? 0) + h.qty);
  }
  return { byProduct, byBatch };
}

/**
 * A paid field order whose stock is gone: refund the whole payment, once, and tell the
 * customer. Safe to call from both the app's save and the Razorpay webhook: the first caller
 * claims the order id, the other sees it already handled.
 */
export async function refundUnfillableOrder(input: {
  orderId: string;
  paymentId: string;
  phone: string | null;
  reason: string;
}): Promise<{ refunded: boolean; amountRupees: number; alreadyHandled: boolean }> {
  // The app's save and the webhook can race: if the other one billed it, it was filled.
  const [billed] = await db
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.externalOrderId, input.orderId))
    .limit(1);
  if (billed) return { refunded: false, amountRupees: 0, alreadyHandled: true };

  const claimed = await db
    .insert(fieldUnfilledOrders)
    .values({ orderId: input.orderId, paymentId: input.paymentId, phone: input.phone, reason: input.reason.slice(0, 500) })
    .onConflictDoNothing()
    .returning({ orderId: fieldUnfilledOrders.orderId });
  if (!claimed.length) {
    // A refund that failed earlier (Razorpay down) is retried by whoever comes next.
    const retry = await db
      .update(fieldUnfilledOrders)
      .set({ status: "refunding" })
      .where(and(eq(fieldUnfilledOrders.orderId, input.orderId), eq(fieldUnfilledOrders.status, "failed")))
      .returning({ orderId: fieldUnfilledOrders.orderId });
    if (!retry.length) {
      const [row] = await db.select().from(fieldUnfilledOrders).where(eq(fieldUnfilledOrders.orderId, input.orderId)).limit(1);
      return { refunded: row?.status === "refunded" || row?.status === "voided", amountRupees: Number(row?.amount) || 0, alreadyHandled: true };
    }
  }

  await releaseHolds(input.orderId);
  try {
    const payment = (await getRazorpayPayment(input.paymentId)) as {
      amount?: number;
      amount_refunded?: number;
      status?: string;
    };
    const left = (Number(payment.amount) || 0) - (Number(payment.amount_refunded) || 0);
    let refundId: string | null = null;
    if (left > 0 && payment.status === "captured") {
      const refund = await refundRazorpayPayment({
        paymentId: input.paymentId,
        amountPaise: left,
        receipt: `nostock-${input.orderId}`.slice(0, 40),
        notes: { order: input.orderId, reason: "Out of stock when billing" },
      });
      refundId = refund.id ?? null;
    }
    const amountRupees = Math.max(0, left) / 100;
    await db
      .update(fieldUnfilledOrders)
      // An authorized-but-uncaptured payment is never taken: Razorpay returns it by itself.
      .set({ status: payment.status === "captured" ? "refunded" : "voided", refundId, amount: amountRupees.toFixed(2) })
      .where(eq(fieldUnfilledOrders.orderId, input.orderId));
    if (input.phone) {
      notifyLater([input.phone], {
        en: {
          title: `Refund sent · ${input.orderId}`,
          body: `Sorry, an item sold out while you were paying. ₹${Math.round(amountRupees)} is on its way back to your account (5–7 days).`,
          url: "/notifications",
          channel: "orders",
        },
        ta: {
          title: `பணம் திருப்பி அனுப்பப்பட்டது · ${input.orderId}`,
          body: `மன்னிக்கவும், நீங்கள் பணம் செலுத்தும்போது ஒரு பொருள் தீர்ந்துவிட்டது. ₹${Math.round(amountRupees)} உங்கள் கணக்குக்கு திரும்ப வரும் (5–7 நாட்கள்).`,
          url: "/notifications",
          channel: "orders",
        },
      });
    }
    return { refunded: true, amountRupees, alreadyHandled: false };
  } catch (err) {
    console.error("[stock-holds] auto refund failed", { orderId: input.orderId, paymentId: input.paymentId, err });
    await db
      .update(fieldUnfilledOrders)
      .set({ status: "failed" })
      .where(eq(fieldUnfilledOrders.orderId, input.orderId));
    return { refunded: false, amountRupees: 0, alreadyHandled: false };
  }
}

/** Products in a list of holds' keys, for tests and admin views. */
export async function holdsFor(keys: string[]) {
  if (!keys.length) return [];
  return db.select().from(stockHolds).where(inArray(stockHolds.holdKey, keys));
}
