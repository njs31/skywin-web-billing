"use server";

import { db } from "@/db";
import { products } from "@/db/schema";
import { ilike, or, sql, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function searchProducts(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return [];

  return db
    .select()
    .from(products)
    .where(
      or(
        ilike(products.name, `%${q}%`),
        ilike(products.sku, `%${q}%`),
        ilike(products.barcode, `%${q}%`)
      )
    )
    .orderBy(asc(products.name))
    .limit(limit);
}

export async function getProducts(search?: string) {
  if (search?.trim()) {
    return searchProducts(search, 100);
  }
  return db.select().from(products).orderBy(asc(products.name)).limit(200);
}

export async function getProductById(id: number) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return product ?? null;
}

export async function updateProduct(
  id: number,
  data: {
    saleRate: number;
    gstRate: number;
    stockQty?: number;
  }
) {
  await db
    .update(products)
    .set({
      saleRate: data.saleRate.toFixed(2),
      gstRate: data.gstRate.toFixed(2),
      ...(data.stockQty !== undefined
        ? { stockQty: data.stockQty.toFixed(2) }
        : {}),
    })
    .where(eq(products.id, id));

  revalidatePath("/products");
  revalidatePath("/pos");
}

export async function getLowStockProducts(threshold = 10) {
  return db
    .select()
    .from(products)
    .where(sql`${products.stockQty}::numeric < ${threshold}`)
    .orderBy(asc(products.stockQty))
    .limit(20);
}

export async function getProductStats() {
  const [result] = await db
    .select({
      total: sql<number>`count(*)::int`,
      lowStock: sql<number>`count(*) filter (where ${products.stockQty}::numeric < 10)::int`,
    })
    .from(products);
  return result;
}
