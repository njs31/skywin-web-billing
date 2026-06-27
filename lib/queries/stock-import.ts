import { db } from "@/db";
import { products, stockMovements } from "@/db/schema";
import { eq, or, sql, and } from "drizzle-orm";

/** Resolve a scanned QR/barcode value to a product. */
export async function getProductByScanCode(code: string) {
  const raw = code.trim();
  if (!raw) return null;

  const idMatch = raw.match(/^SW-?(\d+)$/i);
  if (idMatch) {
    const id = parseInt(idMatch[1], 10);
    const [byId] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.isActive, true)))
      .limit(1);
    if (byId) return byId;
  }

  if (/^\d+$/.test(raw)) {
    const id = parseInt(raw, 10);
    const [byId] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.isActive, true)))
      .limit(1);
    if (byId) return byId;
  }

  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        or(
          eq(products.barcode, raw),
          eq(products.sku, raw),
          eq(products.name, raw),
          sql`lower(${products.barcode}) = lower(${raw})`,
          sql`lower(${products.sku}) = lower(${raw})`,
          sql`lower(${products.name}) = lower(${raw})`
        )
      )
    )
    .limit(1);

  return product ?? null;
}

export type StockImportRow = {
  code: string;
  qty: number;
  rate?: number;
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
  const failed: StockImportResult["failed"] = [];
  let imported = 0;

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

    await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({
          stockQty: sql`${products.stockQty}::numeric + ${row.qty}`,
          ...(row.rate !== undefined
            ? { purchaseRate: row.rate.toFixed(2) }
            : {}),
        })
        .where(eq(products.id, product.id));

      await tx.insert(stockMovements).values({
        productId: product.id,
        type: "adjustment",
        qtyDelta: row.qty.toFixed(2),
        notes,
      });
    });

    imported++;
  }

  revalidateTag("products", "max");
  revalidatePath("/stock");
  revalidatePath("/products");

  return { imported, failed };
}
