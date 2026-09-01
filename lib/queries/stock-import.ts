import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { eq, or, sql, and } from "drizzle-orm";
import { parseScanCode } from "@/lib/scan-code";

/** Resolve a scanned QR/barcode value to a product in a single query. */
export async function getProductByScanCode(code: string) {
  const { text, id } = parseScanCode(code);
  if (!text) return null;

  const matchers = [
    sql`lower(${products.barcode}) = lower(${text})`,
    sql`lower(${products.sku}) = lower(${text})`,
    sql`lower(${products.name}) = lower(${text})`,
  ];
  if (id !== null) matchers.push(eq(products.id, id));

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), or(...matchers)))
    .orderBy(
      // Barcode first, id last. A scanner reads the barcode off the product,
      // so a numeric barcode that happens to equal some other product's id
      // must not win — that silently bills the wrong item.
      sql`(lower(${products.barcode}) = lower(${text})) desc`,
      sql`(lower(${products.sku}) = lower(${text})) desc`,
      id !== null ? sql`(${products.id} = ${id}) desc` : sql`1`
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
