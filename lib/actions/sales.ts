"use server";

import { db } from "@/db";
import {
  sales,
  saleItems,
  products,
  stockMovements,
} from "@/db/schema";
import {
  calculateGstBreakdown,
  calculateLineAmount,
} from "@/lib/gst";
import { format } from "date-fns";
import { desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const saleItemSchema = z.object({
  productId: z.number(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.number().nonnegative(),
});

const createSaleSchema = z.object({
  customerName: z.string().optional(),
  paymentMode: z.enum(["cash", "upi", "credit"]),
  items: z.array(saleItemSchema).min(1),
});

async function generateInvoiceNo() {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `INV-${today}-`;

  const [last] = await db
    .select({ invoiceNo: sales.invoiceNo })
    .from(sales)
    .where(sql`${sales.invoiceNo} like ${prefix + "%"}`)
    .orderBy(desc(sales.invoiceNo))
    .limit(1);

  let seq = 1;
  if (last?.invoiceNo) {
    const parts = last.invoiceNo.split("-");
    seq = parseInt(parts[2] ?? "0", 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createSale(input: z.infer<typeof createSaleSchema>) {
  const data = createSaleSchema.parse(input);

  for (const item of data.items) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, item.productId))
      .limit(1);

    if (!product) {
      throw new Error(`Product ${item.productId} not found`);
    }

    const stock = parseFloat(product.stockQty);
    if (stock < item.qty) {
      throw new Error(
        `Insufficient stock for ${product.name}. Available: ${stock}`
      );
    }
  }

  const gst = calculateGstBreakdown(
    data.items.map((i) => ({
      qty: i.qty,
      rate: i.rate,
      gstRate: i.gstRate,
    }))
  );

  const invoiceNo = await generateInvoiceNo();

  const sale = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(sales)
      .values({
        invoiceNo,
        customerName: data.customerName,
        paymentMode: data.paymentMode,
        subtotal: gst.subtotal.toFixed(2),
        cgst: gst.cgst.toFixed(2),
        sgst: gst.sgst.toFixed(2),
        igst: gst.igst.toFixed(2),
        grandTotal: gst.grandTotal.toFixed(2),
      })
      .returning();

    for (const item of data.items) {
      const amount = calculateLineAmount(item.qty, item.rate);

      await tx.insert(saleItems).values({
        saleId: created.id,
        productId: item.productId,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        gstRate: item.gstRate.toFixed(2),
        amount: amount.toFixed(2),
      });

      await tx
        .update(products)
        .set({
          stockQty: sql`${products.stockQty}::numeric - ${item.qty}`,
        })
        .where(eq(products.id, item.productId));

      await tx.insert(stockMovements).values({
        productId: item.productId,
        type: "sale",
        qtyDelta: (-item.qty).toFixed(2),
        referenceId: created.id,
      });
    }

    return created;
  });

  revalidatePath("/invoices");
  revalidatePath("/pos");
  revalidatePath("/products");
  revalidatePath("/");

  return sale;
}

export async function getSales() {
  return db.select().from(sales).orderBy(desc(sales.date)).limit(100);
}

export async function getSaleById(id: number) {
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, id))
    .limit(1);

  if (!sale) return null;

  const items = await db
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      productName: products.name,
      hsnCode: products.hsnCode,
      qty: saleItems.qty,
      rate: saleItems.rate,
      gstRate: saleItems.gstRate,
      amount: saleItems.amount,
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, id));

  return { ...sale, items };
}

export async function getTodaySalesTotal() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(gte(sales.date, startOfDay));

  return {
    total: parseFloat(result?.total ?? "0"),
    count: result?.count ?? 0,
  };
}

export async function getRecentSales(limit = 5) {
  return db.select().from(sales).orderBy(desc(sales.date)).limit(limit);
}

export async function getTopSellingProducts(limit = 5) {
  return db
    .select({
      productName: products.name,
      totalQty: sql<string>`sum(${saleItems.qty}::numeric)`,
      totalAmount: sql<string>`sum(${saleItems.amount}::numeric)`,
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .groupBy(products.name)
    .orderBy(desc(sql`sum(${saleItems.amount}::numeric)`))
    .limit(limit);
}

export async function getSalesInRange(days = 7) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  return db
    .select({
      date: sql<string>`date(${sales.date})`,
      total: sql<string>`sum(${sales.grandTotal}::numeric)`,
      count: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(gte(sales.date, from))
    .groupBy(sql`date(${sales.date})`)
    .orderBy(sql`date(${sales.date})`);
}
