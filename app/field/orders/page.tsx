import { fieldOrdersDashboard } from "@/lib/actions/field";
import { toOrderView } from "@/lib/field-order-view";
import { OrdersBoard } from "./orders-board";

export const dynamic = "force-dynamic";

/** Field app orders for admins: stats, search and filters, and each order with refund / cancel. */
export default async function FieldOrdersAdminPage() {
  const data = await fieldOrdersDashboard();

  const orders = data.orders.map(toOrderView);

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
