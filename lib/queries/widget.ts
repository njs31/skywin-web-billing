import { db } from "@/db";
import { sales, saleItems, products } from "@/db/schema";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { format, startOfDay, subDays } from "date-fns";
import { getSettings } from "@/lib/settings";

export type WidgetTrendPoint = {
  date: string;
  label: string;
  short: string;
  total: number;
  bills: number;
};

export type WidgetLowStockItem = {
  name: string;
  qty: number;
};

export type WidgetTopSellerItem = {
  name: string;
  qty: number;
  amount: number;
};

export type WidgetPayload = {
  business: string;
  updatedAt: string;
  today: {
    total: number;
    count: number;
    cash: number;
    upi: number;
    yesterdayTotal: number;
    changePct: number;
  };
  trend: WidgetTrendPoint[];
  lowStock: WidgetLowStockItem[];
  topSellers: WidgetTopSellerItem[];
};

function emptyTrend(days: number): WidgetTrendPoint[] {
  const out: WidgetTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(startOfDay(new Date()), i);
    out.push({
      date: format(d, "yyyy-MM-dd"),
      label: format(d, "dd MMM"),
      short: format(d, "EEE"),
      total: 0,
      bills: 0,
    });
  }
  return out;
}

function changePct(today: number, yesterday: number) {
  if (yesterday <= 0) return today > 0 ? 100 : 0;
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10;
}

/** Shop-wide widget stats (no dealer/customer filter). */
export async function getWidgetPayload(): Promise<WidgetPayload> {
  const todayStart = startOfDay(new Date());
  const yesterdayStart = subDays(todayStart, 1);
  const trendFrom = subDays(todayStart, 6);

  const [
    settings,
    [todayRow],
    [yesterdayRow],
    trendRows,
    lowStockRows,
    topSellerRows,
  ] = await Promise.all([
    getSettings(),
    db
      .select({
        todayTotal: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
        todayCount: sql<number>`count(*)::int`,
        cash: sql<string>`coalesce(sum(${sales.cashAmount}::numeric), 0)`,
        upi: sql<string>`coalesce(sum(${sales.upiAmount}::numeric), 0)`,
      })
      .from(sales)
      .where(gte(sales.date, todayStart)),
    db
      .select({
        yesterdayTotal: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
      })
      .from(sales)
      .where(and(gte(sales.date, yesterdayStart), lt(sales.date, todayStart))),
    db
      .select({
        day: sql<string>`to_char(${sales.date}, 'YYYY-MM-DD')`,
        total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
        bills: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(gte(sales.date, trendFrom))
      .groupBy(sql`to_char(${sales.date}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${sales.date}, 'YYYY-MM-DD')`),
    db
      .select({
        name: products.name,
        qty: products.stockQty,
      })
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`${products.stockQty}::numeric < 10`
        )
      )
      .orderBy(asc(products.stockQty))
      .limit(2),
    db
      .select({
        name: products.name,
        qty: sql<string>`coalesce(sum(${saleItems.qty}::numeric), 0)`,
        amount: sql<string>`coalesce(sum(${saleItems.amount}::numeric), 0)`,
      })
      .from(saleItems)
      .innerJoin(products, eq(saleItems.productId, products.id))
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(gte(sales.date, trendFrom))
      .groupBy(products.id, products.name)
      .orderBy(desc(sql`sum(${saleItems.qty}::numeric)`))
      .limit(2),
  ]);

  const todayTotal = parseFloat(todayRow?.todayTotal ?? "0");
  const yesterdayTotal = parseFloat(yesterdayRow?.yesterdayTotal ?? "0");

  const trendMap = new Map(
    trendRows.map((r) => [
      r.day,
      { total: parseFloat(r.total), bills: r.bills ?? 0 },
    ])
  );

  return {
    business: settings.businessName || "SKYWIN BIOTECH",
    updatedAt: new Date().toISOString(),
    today: {
      total: todayTotal,
      count: todayRow?.todayCount ?? 0,
      cash: parseFloat(todayRow?.cash ?? "0"),
      upi: parseFloat(todayRow?.upi ?? "0"),
      yesterdayTotal,
      changePct: changePct(todayTotal, yesterdayTotal),
    },
    trend: emptyTrend(7).map((d) => {
      const hit = trendMap.get(d.date);
      return hit ? { ...d, total: hit.total, bills: hit.bills } : d;
    }),
    lowStock: lowStockRows.map((r) => ({
      name: r.name,
      qty: parseFloat(r.qty ?? "0"),
    })),
    topSellers: topSellerRows.map((r) => ({
      name: r.name,
      qty: parseFloat(r.qty ?? "0"),
      amount: parseFloat(r.amount ?? "0"),
    })),
  };
}
