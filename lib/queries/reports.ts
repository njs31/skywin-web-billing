import { db } from "@/db";
import {
  products,
  stockMovements,
  sales,
  saleItems,
  purchases,
  purchaseItems,
  categories,
  customers,
} from "@/db/schema";
import { eq, sql, desc, asc, gte, lte, and, isNotNull } from "drizzle-orm";

export async function adjustStock(
  productId: number,
  qtyDelta: number,
  notes: string
) {
  const { revalidatePath, revalidateTag } = await import("next/cache");

  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        stockQty: sql`${products.stockQty}::numeric + ${qtyDelta}`,
      })
      .where(eq(products.id, productId));

    await tx.insert(stockMovements).values({
      productId,
      type: "adjustment",
      qtyDelta: qtyDelta.toFixed(2),
      notes,
    });
  });

  revalidateTag("products", "max");
  revalidatePath("/stock");
  revalidatePath("/products");
}

export async function getStockStatus(search?: string) {
  const query = db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      stockQty: products.stockQty,
      reorderLevel: products.reorderLevel,
      purchaseRate: products.purchaseRate,
      saleRate: products.saleRate,
      categoryName: categories.name,
      expiryDate: products.expiryDate,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name))
    .limit(500);

  return query;
}

export async function getNearExpiryProducts(days = 90) {
  const future = new Date();
  future.setDate(future.getDate() + days);
  const today = new Date().toISOString().split("T")[0];
  const futureStr = future.toISOString().split("T")[0];

  return db
    .select({
      id: products.id,
      name: products.name,
      stockQty: products.stockQty,
      expiryDate: products.expiryDate,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        isNotNull(products.expiryDate),
        gte(products.expiryDate, today),
        lte(products.expiryDate, futureStr)
      )
    )
    .orderBy(asc(products.expiryDate));
}

export async function getStockValuation() {
  const [result] = await db
    .select({
      totalQty: sql<string>`coalesce(sum(${products.stockQty}::numeric), 0)`,
      purchaseValue: sql<string>`coalesce(sum(${products.stockQty}::numeric * ${products.purchaseRate}::numeric), 0)`,
      saleValue: sql<string>`coalesce(sum(${products.stockQty}::numeric * ${products.saleRate}::numeric), 0)`,
      productCount: sql<number>`count(*)::int`,
    })
    .from(products)
    .where(eq(products.isActive, true));

  return {
    totalQty: parseFloat(result?.totalQty ?? "0"),
    purchaseValue: parseFloat(result?.purchaseValue ?? "0"),
    saleValue: parseFloat(result?.saleValue ?? "0"),
    productCount: result?.productCount ?? 0,
  };
}

export async function getStockMovements(productId?: number, limit = 50) {
  const conditions = productId ? eq(stockMovements.productId, productId) : undefined;
  return db
    .select({
      id: stockMovements.id,
      productName: products.name,
      type: stockMovements.type,
      qtyDelta: stockMovements.qtyDelta,
      notes: stockMovements.notes,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .where(conditions)
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

export async function getProductWiseSales(from?: Date, to?: Date) {
  const conditions = [];
  if (from) conditions.push(gte(sales.date, from));
  if (to) conditions.push(lte(sales.date, to));

  return db
    .select({
      productName: products.name,
      sku: products.sku,
      totalQty: sql<string>`sum(${saleItems.qty}::numeric)`,
      totalAmount: sql<string>`sum(${saleItems.amount}::numeric)`,
      avgRate: sql<string>`avg(${saleItems.rate}::numeric)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(products.name, products.sku)
    .orderBy(desc(sql`sum(${saleItems.amount}::numeric)`))
    .limit(200);
}

export async function getPartyWiseSales(from?: Date, to?: Date) {
  const conditions = [];
  if (from) conditions.push(gte(sales.date, from));
  if (to) conditions.push(lte(sales.date, to));

  return db
    .select({
      customerName: sql<string>`coalesce(${customers.name}, ${sales.customerName}, 'Walk-in')`,
      billCount: sql<number>`count(*)::int`,
      totalAmount: sql<string>`sum(${sales.grandTotal}::numeric)`,
      creditAmount: sql<string>`sum(case when ${sales.paymentMode} = 'credit' then ${sales.grandTotal}::numeric else 0 end)`,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sql`coalesce(${customers.name}, ${sales.customerName}, 'Walk-in')`)
    .orderBy(desc(sql`sum(${sales.grandTotal}::numeric)`))
    .limit(100);
}

export async function getDailySummary(from?: Date, to?: Date) {
  const start = from ?? new Date(new Date().setDate(new Date().getDate() - 30));
  const end = to ?? new Date();

  const salesByDay = await db
    .select({
      date: sql<string>`date(${sales.date})`,
      salesTotal: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
      billCount: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(gte(sales.date, start), lte(sales.date, end)))
    .groupBy(sql`date(${sales.date})`)
    .orderBy(desc(sql`date(${sales.date})`));

  const purchasesByDay = await db
    .select({
      date: sql<string>`date(${purchases.date})`,
      purchaseTotal: sql<string>`coalesce(sum(${purchases.grandTotal}::numeric), 0)`,
    })
    .from(purchases)
    .where(and(gte(purchases.date, start), lte(purchases.date, end)))
    .groupBy(sql`date(${purchases.date})`);

  const purchaseMap = Object.fromEntries(
    purchasesByDay.map((p) => [p.date, parseFloat(p.purchaseTotal)])
  );

  return salesByDay.map((s) => ({
    date: s.date,
    salesTotal: parseFloat(s.salesTotal),
    billCount: s.billCount,
    purchaseTotal: purchaseMap[s.date] ?? 0,
    grossProfit: parseFloat(s.salesTotal) - (purchaseMap[s.date] ?? 0),
  }));
}

export async function getGrossProfitReport(from?: Date, to?: Date) {
  const conditions = [];
  if (from) conditions.push(gte(sales.date, from));
  if (to) conditions.push(lte(sales.date, to));

  const [result] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${saleItems.amount}::numeric), 0)`,
      cost: sql<string>`coalesce(sum(${saleItems.qty}::numeric * ${products.purchaseRate}::numeric), 0)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(conditions.length ? and(...conditions) : undefined);

  const revenue = parseFloat(result?.revenue ?? "0");
  const cost = parseFloat(result?.cost ?? "0");

  return {
    revenue,
    cost,
    grossProfit: revenue - cost,
    margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
  };
}

export async function getPurchaseBook(from?: Date, to?: Date) {
  const conditions = [];
  if (from) conditions.push(gte(purchases.date, from));
  if (to) conditions.push(lte(purchases.date, to));

  return db
    .select({
      id: purchases.id,
      date: purchases.date,
      invoiceNo: purchases.invoiceNo,
      supplierName: sql<string>`(select name from suppliers where id = ${purchases.supplierId})`,
      paymentType: purchases.paymentType,
      grandTotal: purchases.grandTotal,
    })
    .from(purchases)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(purchases.date))
    .limit(500);
}
