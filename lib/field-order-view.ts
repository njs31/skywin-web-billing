import type { listFieldOrders } from "@/lib/queries/field-orders";
import { delhiveryTrackUrl, orderLocationMapsUrl } from "@/lib/queries/field-orders";
import { isDelhiveryWaybill } from "@/lib/order-status";

/** One Field app order as the office pages show it. */
export type OrderView = {
  id: number;
  orderId: string;
  invoiceNo: string;
  date: string;
  status: string;
  stage: string | null;
  farmerName: string;
  farmerPhone: string;
  /** Officer who placed it for the farmer; empty when the farmer ordered in the app. */
  placedBy: string;
  paid: number;
  refunded: number;
  total: number;
  paymentId: string | null;
  gps: string | null;
  mapsUrl: string | null;
  waybill: string | null;
  trackUrl: string | null;
  goods: Array<{ name: string; qty: number; batch: string | null; expiry: string | null; amount: number }>;
  deliveryCharge: number;
  /** "qwicks" for orders placed in QwicksApp; "field" for the SkyWin Field app. */
  source: "field" | "qwicks";
  /** Id the delivery steps are saved under (the order id, or the invoice for old orders). */
  trackingId: string;
  /** Delivery steps, newest first. */
  history: Array<{ checkpoint: string; at: string; note: string | null; by: string | null }>;
};

type ListedOrder = Awaited<ReturnType<typeof listFieldOrders>>["orders"][number];

export function toOrderView(order: ListedOrder): OrderView {
  const placedBy = (order.operatorName ?? "").replace(/^Field · /, "").trim();
  const delivery = order.lines.filter((l) => !l.productId && /^delivery charges/i.test(l.name));
  const goods = order.lines.filter((l) => !delivery.includes(l));
  return {
    id: order.id,
    orderId: order.externalOrderId || order.invoiceNo,
    invoiceNo: order.invoiceNo,
    date: new Date(order.date).toISOString(),
    status: order.status ?? "active",
    stage: order.stage,
    farmerName: order.customerName || "",
    farmerPhone: order.customerPhone || "",
    placedBy: placedBy && placedBy.toLowerCase() !== "farmer" ? placedBy : "",
    paid: order.paid,
    refunded: order.refunded,
    total: Number(order.grandTotal) || 0,
    paymentId: order.razorpayPaymentId,
    gps: order.placedGps,
    mapsUrl: order.placedGps ? orderLocationMapsUrl(order.placedGps) : null,
    waybill: order.waybill,
    trackUrl: order.waybill && isDelhiveryWaybill(order.waybill) ? delhiveryTrackUrl(order.waybill) : null,
    goods: goods.map((l) => ({
      name: l.name,
      qty: l.qty,
      batch: l.batchNumber,
      expiry: l.expiry ? String(l.expiry) : null,
      amount: l.amount,
    })),
    deliveryCharge: delivery.reduce((sum, l) => sum + l.amount, 0),
    source: order.source,
    trackingId: order.trackingId,
    history: order.history,
  };
}
