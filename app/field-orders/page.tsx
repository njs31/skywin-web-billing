import { redirect } from "next/navigation";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orderCheckpoints } from "@/db/schema";
import { getCurrentUser } from "@/lib/actions/auth";
import { listFieldOrders } from "@/lib/queries/field-orders";
import { toOrderView } from "@/lib/field-order-view";
import { OrdersDesk, type StageEvent } from "@/components/shipping/orders-desk";

export const dynamic = "force-dynamic";

export default async function FieldOrdersPage() {
  const [data, user] = await Promise.all([listFieldOrders(), getCurrentUser()]);
  if (!user) redirect("/login");
  const orders = data.orders.map(toOrderView);

  // Delivery history for the order panel's stepper (same stages the farmer sees in the app).
  const ids = orders.map((o) => o.orderId);
  const rows = ids.length
    ? await db
        .select({
          orderId: orderCheckpoints.orderId,
          checkpoint: orderCheckpoints.checkpoint,
          createdAt: orderCheckpoints.createdAt,
          location: orderCheckpoints.location,
          note: orderCheckpoints.note,
        })
        .from(orderCheckpoints)
        .where(inArray(orderCheckpoints.orderId, ids))
        .orderBy(asc(orderCheckpoints.createdAt))
    : [];
  const history: Record<string, StageEvent[]> = {};
  for (const r of rows) {
    // Keep the latest time each stage was reached.
    const list = (history[r.orderId] ??= []);
    const at = list.findIndex((e) => e.checkpoint === r.checkpoint);
    const event = { checkpoint: r.checkpoint, createdAt: r.createdAt.toISOString(), location: r.location, note: r.note };
    if (at >= 0) list[at] = event;
    else list.push(event);
  }

  return (
    <OrdersDesk
      orders={orders}
      history={history}
      canRefund={user.role === "admin"}
      stats={{
        todayCount: data.todayCount,
        todayTotal: data.todayTotal,
        monthCount: data.monthCount,
        monthTotal: data.monthTotal,
      }}
    />
  );
}
