import { redirect } from "next/navigation";
import { asc, desc, eq, inArray, like, or } from "drizzle-orm";
import { db } from "@/db";
import { orderCheckpoints, sales, customers, shippingRates, saleItems, products } from "@/db/schema";
import { fieldSaleWhere, placedGpsFromSale, waybillFromNotes } from "@/lib/queries/field-orders";
import { OrdersTrackingTab, type DispatchOrder } from "@/components/shipping/orders-tracking-tab";
import { RatesConfigTab, type RateItem } from "@/components/shipping/rates-config-tab";
import { SimulatorTab } from "@/components/shipping/simulator-tab";
import { currentShippingUser } from "@/lib/shipping-guard";

export const dynamic = "force-dynamic";

const num = (v: unknown) => Number(v) || 0;

export default async function ShippingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // The layout also checks this; the page checks again so no shipping data is read for anyone else.
  const user = await currentShippingUser();
  if (!user) redirect("/login?denied=shipping");
  const { tab = "orders" } = await searchParams;

  if (tab === "rates") {
    const rateRows = await db.select().from(shippingRates).orderBy(asc(shippingRates.minWeightGrams), asc(shippingRates.id));
    const rates: RateItem[] = rateRows.map((r) => ({
      id: r.id,
      slab: r.slab,
      minWeightGrams: r.minWeightGrams,
      maxWeightGrams: r.maxWeightGrams,
      zoneName: r.zoneName,
      regions: r.regions,
      transitDays: r.transitDays,
      shippingFee: num(r.shippingFee),
      pincodes: r.pincodes || "",
      districts: r.districts || "",
      states: r.states || "",
      isActive: r.isActive,
    }));
    return <RatesConfigTab initialRates={rates} />;
  }

  if (tab === "simulator") {
    const bands = await db
      .selectDistinct({ min: shippingRates.minWeightGrams, max: shippingRates.maxWeightGrams })
      .from(shippingRates)
      .where(eq(shippingRates.isActive, true))
      .orderBy(asc(shippingRates.minWeightGrams));
    return <SimulatorTab bands={bands} />;
  }

  // Field app orders (and any invoice booked for shipping), newest first.
  const saleRows = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      externalOrderId: sales.externalOrderId,
      customerName: sales.customerName,
      customerPhone: customers.phone,
      grandTotal: sales.grandTotal,
      paidAmount: sales.paidAmount,
      upiAmount: sales.upiAmount,
      refundedAmount: sales.refundedAmount,
      status: sales.status,
      destination: sales.destination,
      notes: sales.notes,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(or(fieldSaleWhere(), like(sales.notes, "%AWB %"), like(sales.transporterName, "%SkyWin%"), like(sales.transporterName, "%Delhivery%")))
    .orderBy(desc(sales.date))
    .limit(200);

  const saleIds = saleRows.map((s) => s.id);
  const orderIdOf = (s: (typeof saleRows)[number]) => s.externalOrderId || s.invoiceNo || `BILL-${s.id}`;
  const orderIds = saleRows.map(orderIdOf);

  const [items, checkpoints] = await Promise.all([
    saleIds.length
      ? db
          .select({ saleId: saleItems.saleId, name: products.name, customName: saleItems.customName, productId: saleItems.productId, qty: saleItems.qty })
          .from(saleItems)
          .leftJoin(products, eq(products.id, saleItems.productId))
          .where(inArray(saleItems.saleId, saleIds))
      : Promise.resolve([]),
    orderIds.length
      ? db.select().from(orderCheckpoints).where(inArray(orderCheckpoints.orderId, orderIds)).orderBy(desc(orderCheckpoints.createdAt), desc(orderCheckpoints.id))
      : Promise.resolve([]),
  ]);

  const itemsBySale = new Map<number, DispatchOrder["items"]>();
  for (const it of items) {
    const name = it.customName || it.name || "Item";
    // The delivery charge is an invoice line, not something to pack.
    if (!it.productId && /^delivery charges/i.test(name)) continue;
    const list = itemsBySale.get(it.saleId) ?? [];
    list.push({ name, qty: num(it.qty) || 1 });
    itemsBySale.set(it.saleId, list);
  }

  const historyByOrder = new Map<string, DispatchOrder["history"]>();
  for (const cp of checkpoints) {
    const list = historyByOrder.get(cp.orderId) ?? [];
    list.push({
      id: cp.id,
      checkpoint: cp.checkpoint,
      note: cp.note,
      location: cp.location,
      updatedBy: cp.updatedBy,
      createdAt: cp.createdAt.toISOString(),
    });
    historyByOrder.set(cp.orderId, list);
  }

  const orders: DispatchOrder[] = saleRows.map((s) => {
    const orderId = orderIdOf(s);
    return {
      id: s.id,
      orderId,
      invoiceNo: s.invoiceNo,
      date: s.date.toISOString(),
      farmerName: s.customerName || "",
      farmerPhone: s.customerPhone || "",
      gps: placedGpsFromSale(s.destination, s.notes),
      total: num(s.grandTotal),
      paid: num(s.upiAmount) || num(s.paidAmount) || num(s.grandTotal),
      refunded: num(s.refundedAmount),
      cancelled: s.status === "cancelled",
      waybill: waybillFromNotes(s.notes),
      history: historyByOrder.get(orderId) ?? [],
      items: itemsBySale.get(s.id) ?? [],
    };
  });

  return <OrdersTrackingTab initialOrders={orders} isAdmin={user.role === "admin"} />;
}
