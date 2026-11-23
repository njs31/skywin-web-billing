/**
 * Field → Orders → Delivery route: orders still to deliver, with where to take them.
 * Location: the GPS captured when the order was placed, else the farmer's first farm with GPS.
 */
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { farms } from "@/db/schema";
import { listFieldOrders } from "@/lib/queries/field-orders";
import { getSetting } from "@/lib/settings";
import { inIndia, parseLatLng, type LatLng } from "@/lib/route-plan";

export type RouteStop = {
  saleId: number;
  orderId: string;
  invoiceNo: string;
  date: string;
  source: "field" | "qwicks";
  farmerName: string;
  farmerPhone: string;
  stage: string | null;
  items: number;
  total: number;
  location: LatLng | null;
  /** Where the location came from. */
  locationFrom: "order" | "farm" | null;
};

/** Not cancelled, not fully refunded, not delivered. */
export function isPendingDelivery(o: { status: string | null; stage: string | null; paid: number; refunded: number }) {
  if (o.status === "cancelled") return false;
  if (o.refunded > 0 && o.refunded + 0.5 >= o.paid) return false;
  if (o.stage === "Delivered" || o.stage === "Order Cancelled" || o.stage === "Refunded") return false;
  return true;
}

export async function pendingDeliveryStops(): Promise<RouteStop[]> {
  const { orders } = await listFieldOrders({ includeQwicks: true });
  const pending = orders.filter((o) => isPendingDelivery({ status: o.status, stage: o.stage, paid: o.paid, refunded: o.refunded }));

  const customerIds = [...new Set(pending.map((o) => o.customerId).filter((id): id is number => id != null))];
  const farmRows = customerIds.length
    ? await db
        .select({ customerId: farms.customerId, gps: farms.gps })
        .from(farms)
        .where(inArray(farms.customerId, customerIds))
        .orderBy(asc(farms.id))
    : [];
  const farmGps = new Map<number, LatLng>();
  for (const f of farmRows) {
    if (farmGps.has(f.customerId)) continue;
    const p = parseLatLng(f.gps);
    if (p && inIndia(p)) farmGps.set(f.customerId, p);
  }

  return pending.map((o) => {
    const fromOrder = parseLatLng(o.placedGps);
    const orderPoint = fromOrder && inIndia(fromOrder) ? fromOrder : null;
    const farmPoint = o.customerId != null ? farmGps.get(o.customerId) ?? null : null;
    const goods = o.lines.filter((l) => !(!l.productId && /^delivery charges/i.test(l.name)));
    return {
      saleId: o.id,
      orderId: o.externalOrderId || o.invoiceNo,
      invoiceNo: o.invoiceNo,
      date: new Date(o.date).toISOString(),
      source: o.source,
      farmerName: o.customerName || "",
      farmerPhone: o.customerPhone || "",
      stage: o.stage,
      items: goods.reduce((sum, l) => sum + l.qty, 0),
      total: Number(o.grandTotal) || 0,
      location: orderPoint ?? farmPoint,
      locationFrom: orderPoint ? "order" : farmPoint ? "farm" : null,
    };
  });
}

export async function officeLocation(): Promise<LatLng | null> {
  const p = parseLatLng(await getSetting("fieldOfficeLocation"));
  return p && inIndia(p) ? p : null;
}
