import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { products, categories, productBatches } from "@/db/schema";
import { ilike, or, sql, asc, eq, and, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { inferGstRate, parseSkuFromName } from "@/lib/gst";

const CACHE_TAG = {
  products: "products",
  suppliers: "suppliers",
  purchases: "purchases",
  sales: "sales",
} as const;

export async function searchProducts(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return [];

  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        or(
          ilike(products.name, `%${q}%`),
          ilike(products.sku, `%${q}%`),
          ilike(products.barcode, `%${q}%`),
          eq(products.barcode, q)
        )
      )
    )
    .orderBy(asc(products.name))
    .limit(limit);
}

export type ProductBatchSearchResult = {
  productId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  hsnCode: string | null;
  gstRate: string;
  saleRate: string;
  wholesaleRate: string | null;
  purchaseRate: string;
  productStockQty: string;
  batchId: number | null;
  batchNumber: string | null;
  batchQty: string;
  batchPurchaseRate: string | null;
  batchSaleRate: string | null;
  batchExpiry: string | null;
};

/** Search products and return one row per batch (with stock). */
export async function searchProductBatches(
  query: string,
  limit = 30,
  options?: { onlyInStock?: boolean }
): Promise<ProductBatchSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const onlyInStock = options?.onlyInStock ?? true;

  // Batch-number matches resolve to product ids via an indexed subquery so
  // the planner can use the trigram indexes instead of scanning the join.
  const batchNumberMatch = db
    .select({ productId: productBatches.productId })
    .from(productBatches)
    .where(ilike(productBatches.batchNumber, `%${q}%`));

  const productMatch = and(
    eq(products.isActive, true),
    or(
      ilike(products.name, `%${q}%`),
      ilike(products.sku, `%${q}%`),
      ilike(products.barcode, `%${q}%`),
      eq(products.barcode, q),
      inArray(products.id, batchNumberMatch)
    )
  );

  const rows = await db
    .select({
      productId: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
      saleRate: products.saleRate,
      wholesaleRate: products.wholesaleRate,
      purchaseRate: products.purchaseRate,
      mrp: products.mrp,
      productStockQty: products.stockQty,
      batchId: productBatches.id,
      batchNumber: productBatches.batchNumber,
      batchQty: productBatches.qty,
      batchPurchaseRate: productBatches.purchaseRate,
      batchSaleRate: productBatches.saleRate,
      batchExpiry: productBatches.expiryDate,
    })
    .from(products)
    .leftJoin(productBatches, eq(productBatches.productId, products.id))
    .where(
      onlyInStock
        ? and(
            productMatch,
            or(
              gt(productBatches.qty, "0"),
              and(
                sql`${productBatches.id} is null`,
                gt(products.stockQty, "0")
              )
            )
          )
        : productMatch
    )
    .orderBy(
      asc(products.name),
      sql`case when ${productBatches.expiryDate} is null then 1 else 0 end`,
      asc(productBatches.expiryDate),
      asc(productBatches.batchNumber)
    )
    .limit(limit);

  return rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    hsnCode: row.hsnCode,
    gstRate: row.gstRate,
    saleRate: row.saleRate,
    wholesaleRate: row.wholesaleRate,
    purchaseRate: row.purchaseRate,
    mrp: row.mrp,
    productStockQty: row.productStockQty,
    batchId: row.batchId,
    batchNumber: row.batchNumber,
    batchQty: row.batchQty ?? "0",
    batchPurchaseRate: row.batchPurchaseRate,
    batchSaleRate: row.batchSaleRate,
    batchExpiry: row.batchExpiry,
  }));
}

export const getProducts = unstable_cache(
  async (search?: string, page = 1, pageSize = 50) => {
    if (search?.trim()) {
      return searchProducts(search, 100);
    }
    const offset = (page - 1) * pageSize;
    return db
      .select()
      .from(products)
      .orderBy(asc(products.name))
      .limit(pageSize)
      .offset(offset);
  },
  ["products-list"],
  { revalidate: 30, tags: [CACHE_TAG.products] }
);

export const getProductCount = unstable_cache(
  async () => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products);
    return result?.count ?? 0;
  },
  ["products-count"],
  { revalidate: 60, tags: [CACHE_TAG.products] }
);

export async function getProductById(id: number) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  return product ?? null;
}

export const getLowStockProducts = unstable_cache(
  async (threshold = 10) => {
    return db
      .select()
      .from(products)
      .where(sql`${products.stockQty}::numeric < ${threshold}`)
      .orderBy(asc(products.stockQty))
      .limit(20);
  },
  ["low-stock"],
  { revalidate: 30, tags: [CACHE_TAG.products] }
);

export const getProductStats = unstable_cache(
  async () => {
    const [result] = await db
      .select({
        total: sql<number>`count(*)::int`,
        lowStock: sql<number>`count(*) filter (where ${products.stockQty}::numeric < 10)::int`,
      })
      .from(products);
    return result;
  },
  ["product-stats"],
  { revalidate: 60, tags: [CACHE_TAG.products] }
);

export { CACHE_TAG as PRODUCT_CACHE_TAG };

export async function updateProduct(
  id: number,
  data: {
    saleRate: number;
    wholesaleRate?: number;
    gstRate: number;
    stockQty?: number;
    reorderLevel?: number;
    mrp?: number | null;
    hsnCode?: string;
    barcode?: string;
    expiryDate?: string | null;
  }
) {
  if (data.hsnCode !== undefined && !data.hsnCode.trim()) {
    throw new Error("HSN code is mandatory and cannot be empty.");
  }
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  await db
    .update(products)
    .set({
      saleRate: data.saleRate.toFixed(2),
      gstRate: data.gstRate.toFixed(2),
      ...(data.wholesaleRate !== undefined
        ? { wholesaleRate: data.wholesaleRate.toFixed(2) }
        : {}),
      ...(data.stockQty !== undefined
        ? { stockQty: data.stockQty.toFixed(2) }
        : {}),
      ...(data.reorderLevel !== undefined
        ? { reorderLevel: data.reorderLevel.toFixed(2) }
        : {}),
      ...(data.mrp !== undefined
        ? { mrp: data.mrp === null ? null : data.mrp.toFixed(2) }
        : {}),
      ...(data.hsnCode !== undefined ? { hsnCode: data.hsnCode } : {}),
      ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
      ...(data.expiryDate !== undefined
        ? { expiryDate: data.expiryDate }
        : {}),
    })
    .where(eq(products.id, id));

  // Keep batch selling rates in sync so POS never shows a stale batch price
  // after the product sale rate / MRP is updated.
  await db
    .update(productBatches)
    .set({
      saleRate: data.saleRate.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(productBatches.productId, id));

  revalidateTag("products", "max");
  revalidatePath("/products");
  revalidatePath("/pos");
  revalidatePath("/stock");
}

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.number().optional(),
  unit: z.string().default("pcs"),
  purchaseRate: z.number().nonnegative(),
  saleRate: z.number().nonnegative(),
  wholesaleRate: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative().optional(),
  stockQty: z.number().nonnegative().default(0),
  reorderLevel: z.number().nonnegative().default(10),
  hsnCode: z.string().min(1, "HSN code is mandatory"),
  gstRate: z.number().nonnegative().default(18),
  expiryDate: z.string().optional(),
});

export async function createProduct(input: z.infer<typeof productSchema>) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  let data;
  try {
    data = productSchema.parse(input);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(err.issues.map((e) => e.message).join(", "));
    }
    throw err;
  }
  const [product] = await db
    .insert(products)
    .values({
      name: data.name,
      sku: data.sku ?? parseSkuFromName(data.name),
      barcode: data.barcode,
      categoryId: data.categoryId,
      unit: data.unit,
      purchaseRate: data.purchaseRate.toFixed(2),
      saleRate: data.saleRate.toFixed(2),
      wholesaleRate: (data.wholesaleRate ?? data.saleRate).toFixed(2),
      mrp: data.mrp?.toFixed(2),
      stockQty: "0.00",
      reorderLevel: data.reorderLevel.toFixed(2),
      hsnCode: data.hsnCode,
      gstRate: data.gstRate.toFixed(2),
      expiryDate: data.expiryDate ?? null,
    })
    .returning();

  if (product && (!product.barcode || !product.barcode.trim())) {
    const barcode = `SW${String(product.id).padStart(6, "0")}`;
    await db
      .update(products)
      .set({
        barcode,
        sku: product.sku?.trim() ? product.sku : barcode,
      })
      .where(eq(products.id, product.id));
    product.barcode = barcode;
    if (!product.sku?.trim()) product.sku = barcode;
  }

  if (product && data.stockQty > 0) {
    const { addStockToBatch } = await import("@/lib/batches");
    await addStockToBatch(db, {
      productId: product.id,
      batchNumber: "OPENING",
      qty: data.stockQty,
      purchaseRate: data.purchaseRate,
      saleRate: data.saleRate,
      expiryDate: data.expiryDate ?? null,
      notes: "Opening stock",
    });
  }

  revalidateTag("products", "max");
  revalidatePath("/products");
  revalidatePath("/stock");
  revalidatePath("/pos");
  return product;
}

export const getCategories = unstable_cache(
  async () => db.select().from(categories).orderBy(asc(categories.name)),
  ["categories"],
  { revalidate: 120, tags: ["products"] }
);

export async function getOrCreateCategory(name: string) {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(categories).values({ name }).returning();
  return created;
}

export type StockExportRow = {
  sno: number;
  id: number;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  purchaseRate: number;
  saleRate: number;
  wholesaleRate: number;
  mrp: number;
  hsnCode: string;
  gstRate: number;
  expiryDate: string;
  purchaseValue: number;
  saleValue: number;
  status: string;
};

export async function getAllProductsForExport(): Promise<StockExportRow[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      categoryName: categories.name,
      unit: products.unit,
      stockQty: products.stockQty,
      reorderLevel: products.reorderLevel,
      purchaseRate: products.purchaseRate,
      saleRate: products.saleRate,
      wholesaleRate: products.wholesaleRate,
      mrp: products.mrp,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
      expiryDate: products.expiryDate,
      isActive: products.isActive,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(asc(products.name));

  return rows.map((row, index) => {
    const stockQty = Number(row.stockQty ?? 0);
    const purchaseRate = Number(row.purchaseRate ?? 0);
    const saleRate = Number(row.saleRate ?? 0);
    const wholesaleRate = Number(row.wholesaleRate ?? saleRate);
    const mrp = Number(row.mrp ?? 0);

    return {
      sno: index + 1,
      id: row.id,
      name: row.name,
      sku: row.sku ?? "",
      barcode: row.barcode ?? "",
      category: row.categoryName ?? "General",
      unit: row.unit ?? "pcs",
      stockQty,
      reorderLevel: Number(row.reorderLevel ?? 10),
      purchaseRate,
      saleRate,
      wholesaleRate,
      mrp,
      hsnCode: row.hsnCode ?? "",
      gstRate: Number(row.gstRate ?? 0),
      expiryDate: row.expiryDate ?? "",
      purchaseValue: Math.round(stockQty * purchaseRate * 100) / 100,
      saleValue: Math.round(stockQty * saleRate * 100) / 100,
      status: row.isActive ? "Active" : "Inactive",
    };
  });
}
