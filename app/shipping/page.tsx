import { db } from "@/db";
import { orderCheckpoints, sales, customers, shippingRates, saleItems, products, productBatches } from "@/db/schema";
import { asc, desc, eq, inArray, like, or } from "drizzle-orm";
import { fieldSaleWhere } from "@/lib/queries/field-orders";
import { getShippingProvider, SHIPPING_CHECKPOINTS, type ShippingCheckpoint } from "@/lib/delivery/manual-rates";
import { OrdersTrackingTab, type OrderRow } from "@/components/shipping/orders-tracking-tab";
import { RatesConfigTab, type RateItem } from "@/components/shipping/rates-config-tab";
import { SimulatorTab } from "@/components/shipping/simulator-tab";
import { redirect } from "next/navigation";
import { currentShippingUser } from "@/lib/shipping-guard";

export const dynamic = "force-dynamic";

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // The layout also checks this; the page checks again so no shipping data is read for anyone else.
  if (!(await currentShippingUser())) redirect("/login?denied=shipping");
  const { tab = "orders" } = await searchParams;

  // 1. Fetch Orders with checkpoints
  const saleRows = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      externalOrderId: sales.externalOrderId,
      customerName: sales.customerName,
      customerPhone: customers.phone,
      grandTotal: sales.grandTotal,
      status: sales.status,
      deliveryNote: sales.deliveryNote,
      transporterName: sales.transporterName,
      destination: sales.destination,
      notes: sales.notes,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(
      or(
        fieldSaleWhere(),
        like(sales.notes, "%AWB %"),
        like(sales.transporterName, "%SkyWin%"),
        like(sales.transporterName, "%Delhivery%")
      )
    )
    .orderBy(desc(sales.date))
    .limit(100);

  const saleIds = saleRows.map((s) => s.id);
  const extOrderIds = saleRows.map((s) => s.externalOrderId || `BILL-${s.id}`).filter(Boolean);

  // Fetch items for these sales
  const items =
    saleIds.length === 0
      ? []
      : await db
          .select({
            saleId: saleItems.saleId,
            name: products.name,
            customName: saleItems.customName,
            qty: saleItems.qty,
            amount: saleItems.amount,
          })
          .from(saleItems)
          .leftJoin(products, eq(products.id, saleItems.productId))
          .where(inArray(saleItems.saleId, saleIds));

  const itemsBySale = new Map<number, Array<{ name: string; qty: number; amount: number }>>();
  for (const it of items) {
    const list = itemsBySale.get(it.saleId) ?? [];
    list.push({
      name: it.customName || it.name || "Item",
      qty: Number(it.qty) || 1,
      amount: Number(it.amount) || 0,
    });
    itemsBySale.set(it.saleId, list);
  }

  // Fetch checkpoints history
  const checkpoints =
    extOrderIds.length === 0
      ? []
      : await db
          .select()
          .from(orderCheckpoints)
          .where(inArray(orderCheckpoints.orderId, extOrderIds))
          .orderBy(desc(orderCheckpoints.createdAt));

  const checkpointsByOrder = new Map<string, typeof checkpoints>();
  for (const cp of checkpoints) {
    const list = checkpointsByOrder.get(cp.orderId) ?? [];
    list.push(cp);
    checkpointsByOrder.set(cp.orderId, list);
  }

  const orderRows: OrderRow[] = saleRows.map((s) => {
    const orderId = s.externalOrderId || s.invoiceNo || `BILL-${s.id}`;
    const hist = checkpointsByOrder.get(orderId) || [];
    let currentCp: ShippingCheckpoint = "Order Received";

    if (hist.length > 0 && hist[0].checkpoint) {
      currentCp = hist[0].checkpoint as ShippingCheckpoint;
    } else if (s.status === "cancelled") {
      currentCp = "Order Cancelled";
    } else if (s.deliveryNote && SHIPPING_CHECKPOINTS.includes(s.deliveryNote as ShippingCheckpoint)) {
      currentCp = s.deliveryNote as ShippingCheckpoint;
    }

    return {
      id: s.id,
      orderId,
      invoiceNo: s.invoiceNo,
      date: s.date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      grandTotal: Number(s.grandTotal) || 0,
      status: s.status,
      deliveryNote: s.deliveryNote,
      transporterName: s.transporterName,
      destination: s.destination,
      currentCheckpoint: currentCp,
      checkpointsHistory: hist.map((h) => ({
        id: h.id,
        checkpoint: h.checkpoint,
        note: h.note,
        location: h.location,
        updatedBy: h.updatedBy,
        createdAt: h.createdAt.toISOString(),
      })),
      items: itemsBySale.get(s.id) || [],
    };
  });

  // 2. Fetch Rates
  const rateRows = await db
    .select()
    .from(shippingRates)
    .orderBy(asc(shippingRates.minWeightGrams), asc(shippingRates.id));

  const rates: RateItem[] = rateRows.map((r) => ({
    id: r.id,
    slab: r.slab,
    minWeightGrams: r.minWeightGrams,
    maxWeightGrams: r.maxWeightGrams,
    zoneName: r.zoneName,
    regions: r.regions,
    transitDays: r.transitDays,
    shippingFee: Number(r.shippingFee) || 0,
    pincodes: r.pincodes || "",
    districts: r.districts || "",
    states: r.states || "",
    isActive: r.isActive,
  }));

  if (tab === "rates") {
    return <RatesConfigTab initialRates={rates} />;
  }

  if (tab === "simulator") {
    return <SimulatorTab />;
  }

  return <OrdersTrackingTab initialOrders={orderRows} />;
}
