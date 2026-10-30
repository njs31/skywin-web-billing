import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { products, categories, productBatches, stockMovements, sales, saleItems, productChangeLogs } from "@/db/schema";
import { listedProductIds } from "@/lib/field-listed";
import { ilike, or, sql, asc, desc, eq, and, gt, inArray, gte, lte, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { parseSkuFromName } from "@/lib/gst";
import {
  diffProductFields,
  hasProductChanges,
} from "@/lib/product-changelog";
import type { ProductListStatus } from "@/lib/product-status";
import { duplicateHsnKeys, hsnKey } from "@/lib/duplicate-hsn";

const CACHE_TAG = {
  products: "products",
  suppliers: "suppliers",
  purchases: "purchases",
  sales: "sales",
} as const;

/** What counts as a match. Shared so the list and POS search agree. */
function productMatches(q: string) {
  return and(
    eq(products.isActive, true),
    or(
      ilike(products.name, `%${q}%`),
      ilike(products.sku, `%${q}%`),
      ilike(products.barcode, `%${q}%`),
      eq(products.barcode, q)
    )
  );
}

export async function searchProducts(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return [];

  return db
    .select()
    .from(products)
    .where(productMatches(q))
    .orderBy(asc(products.name))
    .limit(limit);
}

export const PRODUCT_SORTS = ["name", "recent", "price", "stock", "expiry"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export type SortDir = "asc" | "desc";

/**
 * Which way each sort runs when you first pick it.
 *
 * The useful direction, not a uniform one: newest additions and the biggest
 * numbers are what you are looking for when you ask for them, while names read
 * A to Z and expiry dates matter soonest-first.
 */
export const DEFAULT_SORT_DIR: Record<ProductSort, SortDir> = {
  name: "asc",
  recent: "desc",
  price: "desc",
  stock: "desc",
  expiry: "asc",
};

function productOrderBy(sort: ProductSort, dir: SortDir) {
  const by = dir === "asc" ? asc : desc;
  // Name breaks every tie, so a page never reshuffles between loads.
  switch (sort) {
    case "recent":
      return [by(products.createdAt), asc(products.name)];
    case "price":
      return [by(products.saleRate), asc(products.name)];
    case "stock":
      return [by(products.stockQty), asc(products.name)];
    case "expiry":
      // Most products have no expiry date and are never the answer to "what
      // needs selling first", so they sink to the bottom whichever way this
      // runs. Postgres would otherwise sort nulls first on desc.
      return [
        dir === "asc"
          ? sql`${products.expiryDate} asc nulls last`
          : sql`${products.expiryDate} desc nulls last`,
        asc(products.name),
      ];
    default:
      return [by(products.name)];
  }
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
  mrp: string | null;
  discountPercent: string;
  unit: string;
  productStockQty: string;
  batchId: number | null;
  batchNumber: string | null;
  batchQty: string;
  batchPurchaseRate: string | null;
  batchSaleRate: string | null;
  batchExpiry: string | null;
};

/**
 * Shared by searchProductBatches and getProductBatchesById — one row per
 * batch (with stock), given a caller-supplied match on `products`.
 */
async function queryProductBatchRows(
  productMatch: ReturnType<typeof and>,
  limit: number,
  onlyInStock: boolean
): Promise<ProductBatchSearchResult[]> {
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
      discountPercent: products.discountPercent,
      unit: products.unit,
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
    discountPercent: row.discountPercent,
    unit: row.unit ?? "pcs",
    productStockQty: row.productStockQty,
    batchId: row.batchId,
    batchNumber: row.batchNumber,
    batchQty: row.batchQty ?? "0",
    batchPurchaseRate: row.batchPurchaseRate,
    batchSaleRate: row.batchSaleRate,
    batchExpiry: row.batchExpiry,
  }));
}

/** Search products and return one row per batch (with stock). */
export async function searchProductBatches(
  query: string,
  limit = 30,
  options?: { onlyInStock?: boolean; listedOnly?: boolean }
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
    options?.listedOnly ? inArray(products.id, listedProductIds()) : undefined,
    or(
      ilike(products.name, `%${q}%`),
      ilike(products.sku, `%${q}%`),
      ilike(products.barcode, `%${q}%`),
      eq(products.barcode, q),
      inArray(products.id, batchNumberMatch)
    )
  );

  return queryProductBatchRows(productMatch, limit, onlyInStock);
}

/** Listed field products for a category, one row per batch. */
export async function listProductBatchesByIds(ids: number[]): Promise<ProductBatchSearchResult[]> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 400);
  if (unique.length === 0) return [];
  const productMatch = and(
    eq(products.isActive, true),
    inArray(products.id, unique),
    inArray(products.id, listedProductIds())
  );
  return queryProductBatchRows(productMatch, 2000, false);
}

/** Products whose Disc % is above zero. Home preview keeps the stock filter. */
export async function listDiscountedOffers(
  limit = 40,
  options?: { inStockOnly?: boolean; listedOnly?: boolean }
): Promise<ProductBatchSearchResult[]> {
  const inStockOnly = options?.inStockOnly !== false;
  const productMatch = and(
    eq(products.isActive, true),
    options?.listedOnly ? inArray(products.id, listedProductIds()) : undefined,
    gt(products.discountPercent, "0"),
    inStockOnly ? gt(products.stockQty, "0") : undefined
  );
  if (!productMatch) return [];
  const found = await db
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
      discountPercent: products.discountPercent,
      unit: products.unit,
      productStockQty: products.stockQty,
    })
    .from(products)
    .where(productMatch)
    .orderBy(desc(products.discountPercent), asc(products.name))
    .limit(limit);
  if (found.length === 0) return [];
  const batches = await db
    .select({
      id: productBatches.id,
      productId: productBatches.productId,
      batchNumber: productBatches.batchNumber,
      qty: productBatches.qty,
      purchaseRate: productBatches.purchaseRate,
      saleRate: productBatches.saleRate,
      expiryDate: productBatches.expiryDate,
    })
    .from(productBatches)
    .where(inArray(productBatches.productId, found.map((row) => row.productId)));
  const batchByProduct = new Map<number, (typeof batches)[number]>();
  for (const batch of batches) {
    const current = batchByProduct.get(batch.productId);
    const qty = Number(batch.qty) || 0;
    const currentQty = current ? Number(current.qty) || 0 : -1;
    if (!current || (qty > 0 && currentQty <= 0)) batchByProduct.set(batch.productId, batch);
  }
  return found.map((row) => {
    const batch = batchByProduct.get(row.productId);
    return {
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
      discountPercent: row.discountPercent,
      unit: row.unit ?? "pcs",
      productStockQty: row.productStockQty,
      batchId: batch?.id ?? null,
      batchNumber: batch?.batchNumber ?? null,
      batchQty: batch?.qty ?? "0",
      batchPurchaseRate: batch?.purchaseRate ?? null,
      batchSaleRate: batch?.saleRate ?? null,
      batchExpiry: batch?.expiryDate ?? null,
    };
  });
}

/**
 * All in-stock batches for one product, in the same per-batch shape as
 * searchProductBatches — for the POS barcode-scan path, where a scan
 * resolves unambiguously to a product id (not a text query) but that
 * product may still have several batches to choose between. Without this,
 * a scan had no way to surface more than one batch, so it silently billed
 * whichever batch happened to be sitting in the product's own mirrored
 * rate/stock fields (the most recently touched one) instead of asking.
 */
export async function getProductBatchesById(
  productId: number
): Promise<ProductBatchSearchResult[]> {
  const productMatch = and(
    eq(products.isActive, true),
    eq(products.id, productId)
  );
  return queryProductBatchRows(productMatch, 50, true);
}

function listStatusCondition(status: ProductListStatus) {
  return eq(products.isActive, status === "active");
}

export const getProducts = unstable_cache(
  async (
    search?: string,
    page = 1,
    pageSize = 50,
    sort: ProductSort = "name",
    dir: SortDir = "asc",
    status: ProductListStatus = "active"
  ) => {
    const order = productOrderBy(sort, dir);
    const q = search?.trim();
    if (q) {
      // Search results are sorted the same way, so switching sort does not
      // silently stop applying once something is typed in the search box.
      // POS search stays active-only; this list follows the Active/Inactive tab.
      return db
        .select()
        .from(products)
        .where(
          and(
            listStatusCondition(status),
            or(
              ilike(products.name, `%${q}%`),
              ilike(products.sku, `%${q}%`),
              ilike(products.barcode, `%${q}%`),
              eq(products.barcode, q)
            )
          )
        )
        .orderBy(...order)
        .limit(100);
    }
    const offset = (page - 1) * pageSize;
    return db
      .select()
      .from(products)
      .where(listStatusCondition(status))
      .orderBy(...order)
      .limit(pageSize)
      .offset(offset);
  },
  ["products-list"],
  { revalidate: 30, tags: [CACHE_TAG.products] }
);

export const getProductCount = unstable_cache(
  async (status: ProductListStatus = "active") => {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .where(listStatusCondition(status));
    return result?.count ?? 0;
  },
  ["products-count"],
  { revalidate: 60, tags: [CACHE_TAG.products] }
);

export async function getProductById(id: number) {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.isActive, true)))
    .limit(1);
  return product ?? null;
}

export async function getAllProductsForLabelPdf() {
  return db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      saleRate: products.saleRate,
      gstRate: products.gstRate,
      expiryDate: products.expiryDate,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.name));
}

export const getLowStockProducts = unstable_cache(
  async (threshold = 10) => {
    return db
      .select()
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`${products.stockQty}::numeric < ${threshold}`
        )
      )
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
      .from(products)
      .where(eq(products.isActive, true));
    return result;
  },
  ["product-stats"],
  { revalidate: 60, tags: [CACHE_TAG.products] }
);

export async function setProductActive(id: number, isActive: boolean) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const [updated] = await db
    .update(products)
    .set({ isActive })
    .where(eq(products.id, id))
    .returning({ id: products.id, name: products.name, isActive: products.isActive });

  if (!updated) throw new Error("Product not found.");

  await revalidateTag("products", "max");
  await revalidatePath("/products");
  await revalidatePath("/stock");
  await revalidatePath("/pos");

  const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
  scheduleQwicksStockPush([id]);

  return updated;
}

export async function deleteProduct(id: number) {
  await setProductActive(id, false);
}

export { CACHE_TAG as PRODUCT_CACHE_TAG };

export async function updateProduct(
  id: number,
  data: {
    saleRate: number;
    purchaseRate?: number;
    wholesaleRate?: number;
    gstRate: number;
    stockQty?: number;
    reorderLevel?: number;
    mrp?: number | null;
    discountPercent?: number;
    hsnCode?: string;
    barcode?: string;
    expiryDate?: string | null;
    name?: string;
    unit?: string;
  },
  actor?: { userId?: number | null; userName: string }
) {
  if (data.hsnCode !== undefined && !data.hsnCode.trim()) {
    throw new Error("HSN code is mandatory and cannot be empty.");
  }
  if (data.name !== undefined && !data.name.trim()) {
    throw new Error("Product name is required.");
  }
  if (data.stockQty !== undefined && data.stockQty < 0) {
    throw new Error("Stock cannot be negative.");
  }
  if (data.purchaseRate !== undefined && data.purchaseRate < 0) {
    throw new Error("Purchase rate cannot be negative.");
  }
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");

  const [before] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!before) throw new Error("Product not found");

  // Capture current stock before other updates so batch sync uses the right delta.
  let stockDelta: number | null = null;
  if (data.stockQty !== undefined) {
    const currentQty = parseFloat(before.stockQty ?? "0");
    stockDelta = Math.round((data.stockQty - currentQty) * 100) / 100;
  }

  await db
    .update(products)
    .set({
      saleRate: data.saleRate.toFixed(2),
      gstRate: data.gstRate.toFixed(2),
      ...(data.purchaseRate !== undefined
        ? { purchaseRate: data.purchaseRate.toFixed(2) }
        : {}),
      ...(data.wholesaleRate !== undefined
        ? { wholesaleRate: data.wholesaleRate.toFixed(2) }
        : {}),
      ...(data.reorderLevel !== undefined
        ? { reorderLevel: data.reorderLevel.toFixed(2) }
        : {}),
      ...(data.mrp !== undefined
        ? { mrp: data.mrp === null ? null : data.mrp.toFixed(2) }
        : {}),
      ...(data.discountPercent !== undefined
        ? { discountPercent: data.discountPercent.toFixed(2) }
        : {}),
      ...(data.hsnCode !== undefined ? { hsnCode: data.hsnCode } : {}),
      ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
      ...(data.unit !== undefined ? { unit: data.unit } : {}),
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.expiryDate !== undefined
        ? { expiryDate: data.expiryDate }
        : {}),
    })
    .where(eq(products.id, id));

  // Keep batch selling rates in sync so POS never shows a stale batch price
  // after the product sale rate / MRP is updated. Batches whose sale rate has
  // been hand-edited (sale_rate_overridden) keep their own price. Batch
  // *purchase* rates are always left alone: each is the actual cost of that
  // lot, and overwriting them would rewrite cost history.
  await db
    .update(productBatches)
    .set({
      saleRate: data.saleRate.toFixed(2),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(productBatches.productId, id),
        eq(productBatches.saleRateOverridden, false)
      )
    );

  // Live stock edits must go through batch adjustment so POS batch qty stays correct.
  if (stockDelta != null && Math.abs(stockDelta) > 0.0001) {
    const { adjustStock } = await import("@/lib/queries/reports");
    await adjustStock(id, stockDelta, "Stock edited from Products page");
  }

  if (actor?.userName) {
    const after = {
      name: data.name ?? before.name,
      saleRate: data.saleRate,
      purchaseRate: data.purchaseRate ?? before.purchaseRate,
      wholesaleRate: data.wholesaleRate ?? before.wholesaleRate,
      gstRate: data.gstRate,
      stockQty: data.stockQty ?? before.stockQty,
      reorderLevel: data.reorderLevel ?? before.reorderLevel,
      mrp: data.mrp === undefined ? before.mrp : data.mrp,
      discountPercent: data.discountPercent ?? before.discountPercent,
      hsnCode: data.hsnCode ?? before.hsnCode,
      barcode: data.barcode ?? before.barcode,
      expiryDate: data.expiryDate === undefined ? before.expiryDate : data.expiryDate,
      unit: data.unit ?? before.unit,
    };
    const summary = diffProductFields(before as Record<string, unknown>, after);
    if (hasProductChanges(summary)) {
      await db.insert(productChangeLogs).values({
        productId: id,
        userId: actor.userId ?? null,
        userName: actor.userName,
        summary: JSON.stringify(summary),
      });
      const { recordActivity } = await import("@/lib/queries/activity-logs");
      const { stockSetMessage, productUpdatedMessage } = await import(
        "@/lib/activity-log"
      );
      const productName = String(after.name ?? before.name ?? `#${id}`);
      const stockChange = summary["Stock"];
      const otherChanges = Object.entries(summary)
        .filter(([label]) => label !== "Stock")
        .map(([label, ch]) => `${label} ${ch.from || "—"} → ${ch.to || "—"}`);
      if (stockChange) {
        await recordActivity({
          action: "stock.set",
          message: stockSetMessage(actor.userName, productName, stockChange.to),
          entityType: "product",
          entityId: id,
          actor: actor.userId
            ? { id: actor.userId, name: actor.userName }
            : null,
        });
      }
      if (otherChanges.length > 0) {
        await recordActivity({
          action: "product.update",
          message: productUpdatedMessage(
            actor.userName,
            productName,
            otherChanges
          ),
          entityType: "product",
          entityId: id,
          actor: actor.userId
            ? { id: actor.userId, name: actor.userName }
            : null,
        });
      }
    }
  }

  revalidateTag("products", "max");
  revalidatePath("/products");
  revalidatePath("/pos");
  revalidatePath("/stock");
}

export async function getProductChangeLogs(productId: number, limit = 20) {
  return db
    .select({
      id: productChangeLogs.id,
      userName: productChangeLogs.userName,
      changedAt: productChangeLogs.changedAt,
      summary: productChangeLogs.summary,
    })
    .from(productChangeLogs)
    .where(eq(productChangeLogs.productId, productId))
    .orderBy(desc(productChangeLogs.changedAt))
    .limit(limit);
}

/** Batches for one product, newest first — for the per-batch edit UI. */
export async function getProductBatches(productId: number) {
  return db
    .select({
      id: productBatches.id,
      batchNumber: productBatches.batchNumber,
      qty: productBatches.qty,
      purchaseRate: productBatches.purchaseRate,
      saleRate: productBatches.saleRate,
      saleRateOverridden: productBatches.saleRateOverridden,
      expiryDate: productBatches.expiryDate,
      notes: productBatches.notes,
    })
    .from(productBatches)
    .where(eq(productBatches.productId, productId))
    .orderBy(asc(productBatches.batchNumber));
}

const updateBatchSchema = z.object({
  saleRate: z.number().nonnegative().optional(),
  purchaseRate: z.number().nonnegative().optional(),
  expiryDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Edit one batch in isolation. Setting a sale rate marks the batch as
 * overridden so a later product-level rate change will not reset it. Sibling
 * batches are never touched.
 */
export async function updateBatch(
  batchId: number,
  input: z.infer<typeof updateBatchSchema>
) {
  const data = updateBatchSchema.parse(input);
  const [batch] = await db
    .select({ id: productBatches.id, productId: productBatches.productId })
    .from(productBatches)
    .where(eq(productBatches.id, batchId))
    .limit(1);
  if (!batch) throw new Error("Batch not found.");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.saleRate !== undefined) {
    set.saleRate = data.saleRate.toFixed(2);
    set.saleRateOverridden = true;
  }
  if (data.purchaseRate !== undefined) {
    set.purchaseRate = data.purchaseRate.toFixed(2);
  }
  if (data.expiryDate !== undefined) set.expiryDate = data.expiryDate;
  if (data.notes !== undefined) set.notes = data.notes;

  await db.update(productBatches).set(set).where(eq(productBatches.id, batchId));

  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } =
    await import("@/lib/revalidate");
  revalidateTag("products", "max");
  revalidatePath("/products");
  revalidatePath("/pos");
  return { productId: batch.productId };
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
  discountPercent: z.number().nonnegative().max(100).optional(),
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
      discountPercent: (data.discountPercent ?? 0).toFixed(2),
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

  if (product) {
    const qty = data.stockQty ?? 0;
    if (qty > 0) {
      const { addStockToBatch } = await import("@/lib/batches");
      const batch = await addStockToBatch(db, {
        productId: product.id,
        batchNumber: "OPENING",
        qty,
        purchaseRate: data.purchaseRate,
        saleRate: data.saleRate,
        expiryDate: data.expiryDate ?? null,
        notes: "Opening stock",
      });
      await db.insert(stockMovements).values({
        productId: product.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        type: "adjustment",
        qtyDelta: qty.toFixed(2),
        notes: "Opening stock",
      });
      product.stockQty = qty.toFixed(2);
    } else {
      await db.insert(productBatches).values({
        productId: product.id,
        batchNumber: "OPENING",
        qty: "0.00",
        purchaseRate: data.purchaseRate.toFixed(2),
        saleRate: data.saleRate.toFixed(2),
        expiryDate: data.expiryDate ?? null,
        notes: "Opening stock",
      });
    }
  }

  await revalidateTag("products", "max");
  await revalidatePath("/products");
  await revalidatePath("/stock");
  await revalidatePath("/pos");

  if (product && (data.stockQty ?? 0) > 0) {
    const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
    scheduleQwicksStockPush([product.id]);
  }

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
  qtySold?: number;
  salesAmount?: number;
};

export type ProductDateRangeExport = {
  fromDate: string;
  toDate: string;
  rows: StockExportRow[];
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

export async function getProductsExportForDateRange(
  fromDate: string,
  toDate: string
): Promise<ProductDateRangeExport> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  if (fromDate > toDate) {
    throw new Error("From date cannot be after To date.");
  }

  const from = new Date(`${fromDate}T00:00:00+05:30`);
  const to = new Date(`${toDate}T23:59:59.999+05:30`);

  const [baseRows, salesAgg] = await Promise.all([
    getAllProductsForExport(),
    db
      .select({
        productId: saleItems.productId,
        totalQty: sql<string>`coalesce(sum(${saleItems.qty}::numeric), 0)`,
        totalAmount: sql<string>`coalesce(sum(${saleItems.amount}::numeric), 0)`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(
        and(
          gte(sales.date, from),
          lte(sales.date, to),
          isNotNull(saleItems.productId)
        )
      )
      .groupBy(saleItems.productId),
  ]);

  const salesMap = new Map<
    number,
    { qtySold: number; salesAmount: number }
  >();
  for (const row of salesAgg) {
    if (row.productId == null) continue;
    salesMap.set(row.productId, {
      qtySold: Math.round(Number(row.totalQty) * 100) / 100,
      salesAmount: Math.round(Number(row.totalAmount) * 100) / 100,
    });
  }

  return {
    fromDate,
    toDate,
    rows: baseRows.map((row) => {
      const sold = salesMap.get(row.id);
      return {
        ...row,
        qtySold: sold?.qtySold ?? 0,
        salesAmount: sold?.salesAmount ?? 0,
      };
    }),
  };
}

export type DuplicateHsnStockRow = {
  id: number;
  name: string;
  sku: string;
  hsnCode: string;
  stockQty: number;
  category: string;
};

/** Active products whose HSN is also used by another active product. */
export async function getDuplicateHsnStock(): Promise<DuplicateHsnStockRow[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      hsnCode: products.hsnCode,
      stockQty: products.stockQty,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.isActive, true))
    .orderBy(asc(products.hsnCode), asc(products.name));

  const duplicates = duplicateHsnKeys(rows.map((row) => row.hsnCode));

  return rows
    .filter((row) => duplicates.has(hsnKey(row.hsnCode)))
    .map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku ?? "",
      hsnCode: hsnKey(row.hsnCode),
      stockQty: Number(row.stockQty ?? 0),
      category: row.categoryName ?? "General",
    }));
}
