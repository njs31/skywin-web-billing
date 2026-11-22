import { fieldOrdersDashboard } from "@/lib/actions/field";
import { delhiveryTrackUrl, orderLocationMapsUrl } from "@/lib/queries/field-orders";
import { OrdersBoard, type OrderView } from "./orders-board";

export const dynamic = "force-dynamic";

/** Field app orders for admins: stats, search and filters, and each order with refund / cancel. */
export default async function FieldOrdersAdminPage() {
  const data = await fieldOrdersDashboard();

  const orders: OrderView[] = data.orders.map((order) => {
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
      trackUrl: order.waybill ? delhiveryTrackUrl(order.waybill) : null,
      goods: goods.map((l) => ({
        name: l.name,
        qty: l.qty,
        batch: l.batchNumber,
        expiry: l.expiry ? String(l.expiry) : null,
        amount: l.amount,
      })),
      deliveryCharge: delivery.reduce((sum, l) => sum + l.amount, 0),
    };
  });

  return (
    <OrdersBoard
      orders={orders}
      canRefund={data.canRefund}
      stats={{
        todayCount: data.todayCount,
        todayTotal: data.todayTotal,
        monthCount: data.monthCount,
        monthTotal: data.monthTotal,
      }}
    />
  );
}
