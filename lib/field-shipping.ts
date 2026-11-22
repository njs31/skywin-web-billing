/**
 * Delivery charge on Field app orders.
 *
 * At payment start the server prices delivery from the Shipping dashboard rates (by the order's
 * weight and the delivery PIN), makes sure the payment covers it, and writes it on the Razorpay
 * order (notes.ship / notes.pin). When the order is billed, that amount becomes invoice lines
 * at the products' GST rates (lib/delivery/rate-engine.ts splitShippingByGst).
 */
import { chargeableGramsForItems } from "@/lib/field-listed";
import { calculateManualShippingRate, getShippingProvider } from "@/lib/delivery/manual-rates";
import { quoteDelhivery } from "@/lib/delivery/delhivery";
import { splitShippingByGst } from "@/lib/delivery/rate-engine";
import { getRazorpayOrder } from "@/lib/payments/razorpay";

/** Services Accounting Code for courier services. */
export const SHIPPING_SAC = "996812";

/**
 * The delivery fee the customer pays, from the provider switched on in the Shipping module:
 * Delhivery → Delhivery's live fee ("Delhivery fees"); Manual → the rate sheet ("Delivery fees").
 * If Delhivery's price service is down, the rate sheet is used and labelled as such; a PIN
 * Delhivery does not serve is refused.
 */
export async function quoteFieldDelivery(pin: string, grams: number) {
  const weight = Math.max(100, Math.round(grams || 100));
  if ((await getShippingProvider()) === "delhivery") {
    try {
      const live = await quoteDelhivery(pin, weight);
      return {
        provider: "delhivery" as const,
        label: "Delhivery fees",
        amount: live.amount,
        pin: live.pin,
        weightGrams: live.weightGrams,
        transitDays: "3 - 5 Days",
        zone: "Delhivery",
        courier: "Delhivery",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/does not deliver|valid 6-digit/i.test(message)) throw new Error(`Delivery is not available to PIN ${pin} yet.`);
      console.warn("[field-shipping] Delhivery price unavailable, using the rate sheet:", message);
    }
  }
  const manual = await calculateManualShippingRate(pin, weight);
  return {
    provider: "manual" as const,
    label: "Delivery fees",
    amount: manual.amount,
    pin: manual.pin,
    weightGrams: manual.weightGrams,
    transitDays: manual.transitDays,
    zone: manual.zoneName,
    courier: "SkyWin Delivery",
  };
}

export async function quoteOrderShipping(pin: string, items: Array<{ productId: number; qty: number }>) {
  const grams = await chargeableGramsForItems(items);
  const quote = await quoteFieldDelivery(pin, grams || 100);
  return { amount: quote.amount, pin: quote.pin, zone: quote.zone, grams: quote.weightGrams, provider: quote.provider };
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
