/**
 * Delivery stages exactly as the farmer sees them in the SkyWin Field app (its order stepper),
 * plus one status per order for the office pages. Pure: safe in client and server code.
 */
export const DELIVERY_STEPS = [
  "Order Received",
  "Order Processing",
  "Dispatched",
  "In transit",
  "Out for delivery",
  "Delivered",
] as const;

export type DeliveryStep = (typeof DELIVERY_STEPS)[number];

export function isDeliveryStep(value: string | null | undefined): value is DeliveryStep {
  return !!value && (DELIVERY_STEPS as readonly string[]).includes(value);
}

/** 0-based position in the app's stepper; -1 when the order has no delivery stage yet. */
export function stepIndex(stage: string | null | undefined) {
  return isDeliveryStep(stage) ? DELIVERY_STEPS.indexOf(stage) : -1;
}

/** The stage that normally comes next, or null once delivered. */
export function nextStep(stage: string | null | undefined): DeliveryStep | null {
  const i = stepIndex(stage);
  if (i >= DELIVERY_STEPS.length - 1) return null;
  return DELIVERY_STEPS[i + 1];
}

/** SkyWin's own deliveries get an "SWD-…" reference; anything else is a Delhivery waybill. */
export function isDelhiveryWaybill(waybill: string | null | undefined) {
  return !!waybill && !/^SWD(?:-|$)/i.test(waybill);
}

export type OrderGroup = "dispatch" | "transit" | "delivered" | "refunded" | "cancelled";
export type Tone = "neutral" | "amber" | "blue" | "green" | "red";

/** One status for an order, the most important first: cancelled, refunded, then its delivery stage. */
export function orderStatus(o: {
  status: string;
  stage: string | null;
  paid: number;
  refunded: number;
  waybill?: string | null;
}): { group: OrderGroup; label: string; tone: Tone } {
  if (o.status === "cancelled") return { group: "cancelled", label: "Cancelled", tone: "red" };
  // A partial refund does not stop the delivery, so the order keeps its delivery status.
  if (o.refunded > 0 && o.refunded + 0.5 >= o.paid) return { group: "refunded", label: "Refunded", tone: "amber" };
  const i = stepIndex(o.stage);
  if (i === 5) return { group: "delivered", label: "Delivered", tone: "green" };
  if (i >= 2) return { group: "transit", label: DELIVERY_STEPS[i], tone: "blue" };
  if (i === 1) return { group: "dispatch", label: "Processing", tone: "neutral" };
  if (isDelhiveryWaybill(o.waybill)) return { group: "dispatch", label: "Booked with Delhivery", tone: "neutral" };
  return { group: "dispatch", label: "New order", tone: "neutral" };
}

/** Short names for the stepper where space is tight. */
export const STEP_SHORT: Record<DeliveryStep, string> = {
  "Order Received": "Received",
  "Order Processing": "Processing",
  Dispatched: "Dispatched",
  "In transit": "In transit",
  "Out for delivery": "Out for delivery",
  Delivered: "Delivered",
};
