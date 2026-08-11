import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { eq, or, sql, and } from "drizzle-orm";

/** Resolve a scanned QR/barcode value to a product in a single query. */
export async function getProductByScanCode(code: string) {
  const raw = code.trim();
  if (!raw) return null;

  // "SW-123", "SW123", or a plain number can be a product id.
  const idMatch = raw.match(/^SW-?(\d+)$/i) ?? raw.match(/^(\d+)$/);
  const parsedId = idMatch ? parseInt(idMatch[1], 10) : null;

  const matchers = [
    sql`lower(${products.barcode}) = lower(${raw})`,
    sql`lower(${products.sku}) = lower(${raw})`,
    sql`lower(${products.name}) = lower(${raw})`,
  ];
  if (parsedId !== null) matchers.unshift(eq(products.id, parsedId));

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), or(...matchers)))
    .orderBy(
      // Prefer id match, then barcode, then sku, then name.
      parsedId !== null
        ? sql`(${products.id} = ${parsedId}) desc`
        : sql`1`,
      sql`(lower(${products.barcode}) = lower(${raw})) desc`,
      sql`(lower(${products.sku}) = lower(${raw})) desc`
    )
    .limit(1);

  return product ?? null;
}

export type StockImportRow = {
  code: string;
  qty: number;
  rate?: number;
  batchNumber?: string;
  expiryDate?: string;
};

export type StockImportResult = {
  imported: number;
  failed: { row: number; code: string; reason: string }[];
};

export async function importStockFromRows(
  rows: StockImportRow[],
  notes = "Excel stock import"
): Promise<StockImportResult> {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const { addStockToBatch, defaultBatchNumber } = await import("@/lib/batches");
  const failed: StockImportResult["failed"] = [];
  let imported = 0;
  const touchedProductIds: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.code?.trim() || !row.qty || row.qty <= 0) {
      failed.push({
        row: i + 1,
        code: row.code ?? "",
        reason: "Missing code or invalid quantity",
      });
      continue;
    }

    const product = await getProductByScanCode(row.code);
    if (!product) {
      failed.push({
        row: i + 1,
        code: row.code,
        reason: "Product not found",
      });
      continue;
    }
    if (!product.hsnCode || !product.hsnCode.trim()) {
      failed.push({
        row: i + 1,
        code: row.code,
        reason: "Product lacks a mandatory HSN code. Update the product first.",
      });
      continue;
    }

    await db.transaction(async (tx) => {
      const batch = await addStockToBatch(tx, {
        productId: product.id,
        batchNumber: row.batchNumber?.trim() || defaultBatchNumber("IMP"),
        qty: row.qty,
        purchaseRate: row.rate,
        expiryDate: row.expiryDate || null,
        notes,
      });

      await tx.insert(stockMovements).values({
        productId: product.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        type: "adjustment",
        qtyDelta: row.qty.toFixed(2),
        notes,
      });
    });

    touchedProductIds.push(product.id);
    imported++;
  }

  revalidateTag("products", "max");
  revalidatePath("/stock");
  revalidatePath("/products");

  const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
  scheduleQwicksStockPush(touchedProductIds);

  return { imported, failed };
}
