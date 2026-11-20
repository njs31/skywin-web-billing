export type ShippingProviderMode = "manual" | "delhivery";

export const SHIPPING_CHECKPOINTS = [
  "Order Received",
  "Order Processing",
  "Dispatched",
  "In transit",
  "Out for delivery",
  "Delivered",
  "Refunded",
  "Order Cancelled",
] as const;

export type ShippingCheckpoint = (typeof SHIPPING_CHECKPOINTS)[number];
