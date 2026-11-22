/**
 * Delivery charge on Field app orders.
 *
 * At payment start the server prices delivery from the Shipping dashboard rates (by the order's
 * weight and the delivery PIN), makes sure the payment covers it, and writes it on the Razorpay
 * order (notes.ship / notes.pin). When the order is billed, that amount becomes invoice lines
 * at the products' GST rates (lib/delivery/rate-engine.ts splitShippingByGst).
 */
import { chargeableGramsForItems } from "@/lib/field-listed";
import { calculateManualShippingRate } from "@/lib/delivery/manual-rates";
import { splitShippingByGst } from "@/lib/delivery/rate-engine";
import { getRazorpayOrder } from "@/lib/payments/razorpay";

/** Services Accounting Code for courier services. */
export const SHIPPING_SAC = "996812";

export async function quoteOrderShipping(pin: string, items: Array<{ productId: number; qty: number }>) {
  const grams = await chargeableGramsForItems(items);
  const quote = await calculateManualShippingRate(pin, grams || 100);
  return { amount: quote.amount, pin: quote.pin, zone: quote.zoneName, grams: quote.weightGrams };
}

/** Delivery charge and PIN the server priced for a Razorpay order, if it priced one. */
export async function shippingOnRazorpayOrder(razorpayOrderId: string | null | undefined) {
  if (!razorpayOrderId) return null;
  try {
    const order = (await getRazorpayOrder(razorpayOrderId)) as { notes?: Record<string, string> | unknown[] };
    const notes = order.notes && !Array.isArray(order.notes) ? order.notes : {};
    const amount = Number(notes.ship);
    if (!Number.isFinite(amount) || amount < 0 || notes.ship == null) return null;
    return { amount, pin: String(notes.pin || "") };
  } catch (err) {
    console.warn("[field-shipping] could not read Razorpay order", razorpayOrderId, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Invoice lines for the delivery charge: one per GST rate in the order, each GST-inclusive
 * amount split in proportion to the goods at that rate (spec: shipping follows product GST).
 */
export function shippingInvoiceLines(
  amount: number,
  goods: Array<{ rate: number; qty: number; gstRate: number }>
) {
  const parts = splitShippingByGst(
    amount,
    goods.map((g) => ({ gstRate: g.gstRate, value: g.rate * g.qty * (1 + g.gstRate / 100) }))
  );
  return parts.map((part) => ({
    productId: null,
    customName: parts.length > 1 ? `Delivery charges (GST ${part.gstRate}%)` : "Delivery charges",
    qty: 1,
    // Invoice rates are before GST; the customer paid the GST-inclusive amount.
    rate: Math.round((part.amount / (1 + part.gstRate / 100)) * 100) / 100,
    gstRate: part.gstRate,
    discountType: "percent" as const,
    discountValue: 0,
    hsnCode: SHIPPING_SAC,
    unit: "Pcs",
    batchId: null,
  }));
}
