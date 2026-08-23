import { db } from "@/db";
import { productBatches, products } from "@/db/schema";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { format } from "date-fns";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BatchAddInput = {
  productId: number;
  batchNumber: string;
  qty: number;
  purchaseRate?: number | null;
  saleRate?: number | null;
  expiryDate?: string | null;
  notes?: string | null;
};

export type BatchDeduction = {
  batchId: number;
  batchNumber: string;
  qty: number;
  expiryDate: string | null;
};

function normalizeBatchNumber(value?: string | null) {
  const cleaned = value?.trim().toUpperCase() || "";
  return cleaned || null;
}

export function defaultBatchNumber(prefix = "B") {
  return `${prefix}-${format(new Date(), "yyyyMMdd")}`;
}

/** Keep products.stockQty = sum of all batch quantities. */
export async function syncProductStockQty(tx: DbOrTx, productId: number) {
  const [sumRow] = await tx
    .select({
      total: sql<string>`coalesce(sum(${productBatches.qty}::numeric), 0)`,
    })
    .from(productBatches)
    .where(eq(productBatches.productId, productId));

  const total = parseFloat(sumRow?.total ?? "0");
  await tx
    .update(products)
    .set({ stockQty: total.toFixed(2) })
    .where(eq(products.id, productId));

  // Keep product.expiryDate as nearest upcoming expiry among batches with stock.
  // Clear it when no in-stock batch has an expiry (avoids stale near-expiry alerts).
  const [nearest] = await tx
    .select({ expiryDate: productBatches.expiryDate })
    .from(productBatches)
    .where(
      and(
        eq(productBatches.productId, productId),
        gt(productBatches.qty, "0"),
        sql`${productBatches.expiryDate} is not null`
      )
    )
    .orderBy(asc(productBatches.expiryDate))
    .limit(1);

  await tx
    .update(products)
    .set({ expiryDate: nearest?.expiryDate ?? null })
    .where(eq(products.id, productId));

  return total;
}

/** Add qty to an existing batch (same product + batch number) or create a new one. */
export async function addStockToBatch(tx: DbOrTx, input: BatchAddInput) {
  const batchNumber =
    normalizeBatchNumber(input.batchNumber) || defaultBatchNumber();
  if (input.qty <= 0) {
    throw new Error("Batch quantity must be greater than zero.");
  }

  const [existing] = await tx
    .select()
    .from(productBatches)
    .where(
      and(
        eq(productBatches.productId, input.productId),
        eq(productBatches.batchNumber, batchNumber)
      )
    )
    .limit(1);

  let batch;
  if (existing) {
    const currentQty = parseFloat(existing.qty);
    const currentRate = existing.purchaseRate
      ? parseFloat(existing.purchaseRate)
      : null;
    let nextPurchaseRate = input.purchaseRate ?? currentRate;

    if (
      input.purchaseRate != null &&
      currentRate != null &&
      currentQty > 0
    ) {
      nextPurchaseRate =
        (currentQty * currentRate + input.qty * input.purchaseRate) /
        (currentQty + input.qty);
    }

    const [updated] = await tx
      .update(productBatches)
      .set({
        qty: sql`${productBatches.qty}::numeric + ${input.qty}`,
        purchaseRate:
          nextPurchaseRate != null ? nextPurchaseRate.toFixed(2) : existing.purchaseRate,
        saleRate:
          input.saleRate != null
            ? input.saleRate.toFixed(2)
            : existing.saleRate,
        expiryDate: input.expiryDate ?? existing.expiryDate,
        notes: input.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(productBatches.id, existing.id))
      .returning();
    batch = updated;
  } else {
    const [created] = await tx
      .insert(productBatches)
      .values({
        productId: input.productId,
        batchNumber,
        qty: input.qty.toFixed(2),
        purchaseRate:
          input.purchaseRate != null ? input.purchaseRate.toFixed(2) : null,
        saleRate: input.saleRate != null ? input.saleRate.toFixed(2) : null,
        expiryDate: input.expiryDate || null,
        notes: input.notes || null,
      })
      .returning();
    batch = created;
  }

  // Weighted average purchase rate on product when purchase rate provided
  if (input.purchaseRate != null) {
    const [product] = await tx
      .select({
        stockQty: products.stockQty,
        purchaseRate: products.purchaseRate,
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);

    if (product) {
      const currentStock = parseFloat(product.stockQty);
      const currentRate = parseFloat(product.purchaseRate);
      const totalStock = currentStock + input.qty;
      const newRate =
        totalStock > 0
          ? (currentStock * currentRate + input.qty * input.purchaseRate) /
            totalStock
          : input.purchaseRate;
      await tx
        .update(products)
        .set({ purchaseRate: newRate.toFixed(2) })
        .where(eq(products.id, input.productId));
    }
  }

  // New/updated batch sale price becomes the product's selling rate for POS.
  if (input.saleRate != null) {
    await tx
      .update(products)
      .set({ saleRate: input.saleRate.toFixed(2) })
      .where(eq(products.id, input.productId));
  }

  await syncProductStockQty(tx, input.productId);
  return batch;
}

/** Deduct qty using FEFO (oldest expiry first; null expiry last). */
export async function deductStockFefo(
  tx: DbOrTx,
  productId: number,
  qty: number
): Promise<BatchDeduction[]> {
  if (qty <= 0) throw new Error("Deduction quantity must be positive.");

  const batches = await tx
    .select()
    .from(productBatches)
    .where(
      and(eq(productBatches.productId, productId), gt(productBatches.qty, "0"))
    )
    .orderBy(
      sql`case when ${productBatches.expiryDate} is null then 1 else 0 end`,
      asc(productBatches.expiryDate),
      asc(productBatches.id)
    );

  const available = batches.reduce((s, b) => s + parseFloat(b.qty), 0);
  if (available < qty) {
    const [product] = await tx
      .select({ name: products.name })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    throw new Error(
      `Insufficient stock for ${product?.name ?? `product #${productId}`}. Available: ${available}, requested: ${qty}`
    );
  }

  let remaining = qty;
  const deductions: BatchDeduction[] = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const batchQty = parseFloat(batch.qty);
    const take = Math.min(batchQty, remaining);
    await tx
      .update(productBatches)
      .set({
        qty: sql`${productBatches.qty}::numeric - ${take}`,
        updatedAt: new Date(),
      })
      .where(eq(productBatches.id, batch.id));

    deductions.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      qty: take,
      expiryDate: batch.expiryDate,
    });
    remaining = Math.round((remaining - take) * 100) / 100;
  }

  await syncProductStockQty(tx, productId);
  return deductions;
}

/** Deduct from a specific batch (purchase returns / adjustments / POS). */
export async function deductFromBatch(
  tx: DbOrTx,
  batchId: number,
  qty: number,
  expectedProductId?: number
) {
  if (qty <= 0) throw new Error("Deduction quantity must be positive.");

  const [batch] = await tx
    .select()
    .from(productBatches)
    .where(eq(productBatches.id, batchId))
    .limit(1);

  if (!batch) throw new Error("Batch not found.");
  if (expectedProductId && batch.productId !== expectedProductId) {
    throw new Error("Selected batch does not belong to this product.");
  }
  const available = parseFloat(batch.qty);
  if (available < qty) {
    throw new Error(
      `Insufficient qty in batch ${batch.batchNumber}. Available: ${available}, requested: ${qty}`
    );
  }

  await tx
    .update(productBatches)
    .set({
      qty: sql`${productBatches.qty}::numeric - ${qty}`,
      updatedAt: new Date(),
    })
    .where(eq(productBatches.id, batchId));

  await syncProductStockQty(tx, batch.productId);
  return batch;
}

export async function getBatchesForProduct(productId: number) {
  return db
    .select()
    .from(productBatches)
    .where(eq(productBatches.productId, productId))
    .orderBy(
      sql`case when ${productBatches.expiryDate} is null then 1 else 0 end`,
      asc(productBatches.expiryDate),
      asc(productBatches.batchNumber)
    );
}

export async function getBatchesWithStock(productId: number) {
  return db
    .select()
    .from(productBatches)
    .where(
      and(eq(productBatches.productId, productId), gt(productBatches.qty, "0"))
    )
    .orderBy(
      sql`case when ${productBatches.expiryDate} is null then 1 else 0 end`,
      asc(productBatches.expiryDate),
      asc(productBatches.id)
    );
}

/** One-time: create OPENING batches from existing product stock. */
export async function migrateOpeningBatches() {
  const result = await db.execute(sql`
    INSERT INTO product_batches (
      product_id, batch_number, qty, purchase_rate, sale_rate,
      expiry_date, notes, created_at, updated_at
    )
    SELECT
      id,
      'OPENING',
      stock_qty,
      purchase_rate,
      sale_rate,
      expiry_date,
      'Migrated from product stock',
      NOW(),
      NOW()
    FROM products
    WHERE stock_qty::numeric > 0
    ON CONFLICT (product_id, batch_number) DO NOTHING
  `);
  return result.count ?? 0;
}
