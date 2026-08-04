import { db } from "@/db";
import { sales, saleItems, products } from "@/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { format, subDays, startOfDay } from "date-fns";

async function visibleCustomerFilter() {
  const { getCurrentUser, getVisibleCustomerIds } = await import(
    "@/lib/actions/auth"
  );
  const user = await getCurrentUser();
  if (!user) return null;
  return getVisibleCustomerIds(user);
}

function emptyDailySeries(days: number) {
  const out: { date: string; label: string; total: number; bills: number }[] =
    [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(startOfDay(new Date()), i);
    out.push({
      date: format(d, "yyyy-MM-dd"),
      label: format(d, "dd MMM"),
      total: 0,
      bills: 0,
    });
  }
  return out;
}

/** Last N days sales trend (fills missing days with 0). */
export async function getSalesTrend(days = 30) {
  const customerIds = await visibleCustomerFilter();
  if (customerIds !== null && customerIds.length === 0) {
    return emptyDailySeries(days);
  }

  const from = subDays(startOfDay(new Date()), days - 1);
  const conditions = [gte(sales.date, from)];
  if (customerIds !== null) {
    conditions.push(inArray(sales.customerId, customerIds));
  }

  const rows = await db
    .select({
      day: sql<string>`to_char(${sales.date}, 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
      bills: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(...conditions))
    .groupBy(sql`to_char(${sales.date}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${sales.date}, 'YYYY-MM-DD')`);

  const map = new Map(
    rows.map((r) => [
      r.day,
      { total: parseFloat(r.total), bills: r.bills ?? 0 },
    ])
  );

  return emptyDailySeries(days).map((d) => {
    const hit = map.get(d.date);
    return hit ? { ...d, total: hit.total, bills: hit.bills } : d;
  });
}

/** Payment mode mix for last N days. */
export async function getPaymentModeMix(days = 30) {
  const customerIds = await visibleCustomerFilter();
  if (customerIds !== null && customerIds.length === 0) return [];

  const from = subDays(startOfDay(new Date()), days - 1);
  const conditions = [gte(sales.date, from)];
  if (customerIds !== null) {
    conditions.push(inArray(sales.customerId, customerIds));
  }

  const rows = await db
    .select({
      mode: sales.paymentMode,
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(...conditions))
    .groupBy(sales.paymentMode);

  return rows
    .map((r) => ({
      mode: r.mode,
      label: r.mode.charAt(0).toUpperCase() + r.mode.slice(1),
      total: parseFloat(r.total),
      count: r.count ?? 0,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Retail vs wholesale for last N days. */
export async function getBillTypeMix(days = 30) {
  const customerIds = await visibleCustomerFilter();
  if (customerIds !== null && customerIds.length === 0) {
    return [
      { type: "retail", label: "Retail", total: 0, count: 0 },
      { type: "wholesale", label: "Wholesale", total: 0, count: 0 },
    ];
  }

  const from = subDays(startOfDay(new Date()), days - 1);
  const conditions = [gte(sales.date, from)];
  if (customerIds !== null) {
    conditions.push(inArray(sales.customerId, customerIds));
  }

  const rows = await db
    .select({
      type: sales.billType,
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(...conditions))
    .groupBy(sales.billType);

  const base = [
    { type: "retail" as const, label: "Retail", total: 0, count: 0 },
    { type: "wholesale" as const, label: "Wholesale", total: 0, count: 0 },
  ];

  for (const r of rows) {
    const slot = base.find((b) => b.type === r.type);
    if (slot) {
      slot.total = parseFloat(r.total);
      slot.count = r.count ?? 0;
    }
  }
  return base;
}

/** Top products by revenue (last N days) for bar chart. */
export async function getTopProductsChart(limit = 8, days = 30) {
  const customerIds = await visibleCustomerFilter();
  if (customerIds !== null && customerIds.length === 0) return [];

  const from = subDays(startOfDay(new Date()), days - 1);
  const conditions = [gte(sales.date, from)];
  if (customerIds !== null) {
    conditions.push(inArray(sales.customerId, customerIds));
  }

  const rows = await db
    .select({
      name: products.name,
      qty: sql<string>`coalesce(sum(${saleItems.qty}::numeric), 0)`,
      revenue: sql<string>`coalesce(sum(${saleItems.amount}::numeric), 0)`,
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(and(...conditions))
    .groupBy(products.id, products.name)
    .orderBy(desc(sql`sum(${saleItems.amount}::numeric)`))
    .limit(limit);

  return rows.map((r) => ({
    name: r.name.length > 28 ? `${r.name.slice(0, 26)}…` : r.name,
    fullName: r.name,
    qty: parseFloat(r.qty),
    revenue: parseFloat(r.revenue),
  }));
}

/** Cash vs UPI settlement amounts (last N days). */
export async function getCashUpiSplit(days = 30) {
  const customerIds = await visibleCustomerFilter();
  if (customerIds !== null && customerIds.length === 0) {
    return { cash: 0, upi: 0 };
  }

  const from = subDays(startOfDay(new Date()), days - 1);
  const conditions = [gte(sales.date, from)];
  if (customerIds !== null) {
    conditions.push(inArray(sales.customerId, customerIds));
  }

  const [row] = await db
    .select({
      cash: sql<string>`coalesce(sum(${sales.cashAmount}::numeric), 0)`,
      upi: sql<string>`coalesce(sum(${sales.upiAmount}::numeric), 0)`,
    })
    .from(sales)
    .where(and(...conditions));

  return {
    cash: parseFloat(row?.cash ?? "0"),
    upi: parseFloat(row?.upi ?? "0"),
  };
}
