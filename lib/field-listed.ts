import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { fieldListedProducts, products } from "@/db/schema";

/** Delhivery surface volumetric divisor: cubic centimetres / 5000 = kilograms. */
export const DELHIVERY_VOLUMETRIC_DIVISOR = 5000;

/** Every product listed for the Field app, switched on or off (the dashboard shows them all). */
export function listedProductIds() {
  return db.select({ productId: fieldListedProducts.productId }).from(fieldListedProducts);
}

/** Listed products that are switched on: the only ones farmers and officers see in the app. */
export function appVisibleProductIds() {
  return db
    .select({ productId: fieldListedProducts.productId })
    .from(fieldListedProducts)
    .where(eq(fieldListedProducts.appVisible, true));
}

/** Names of the given products that are switched off in the app (or not listed for it). */
export async function productsHiddenInApp(productIds: number[]) {
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];
  const rows = await db
    .select({ id: products.id, name: products.name, visible: fieldListedProducts.appVisible })
    .from(products)
    .leftJoin(fieldListedProducts, eq(fieldListedProducts.productId, products.id))
    .where(inArray(products.id, ids));
  return rows.filter((r) => r.visible !== true).map((r) => ({ productId: r.id, name: r.name }));
}

/** Pack size written on the product name, used only when the sheet has no weight. */
export function gramsFromName(name: string) {
  const matches = [...name.matchAll(/(\d+(?:\.\d+)?)\s*(KG|KGS|GM|GMS|GRAM|GRAMS|ML|LTR|LITRE|LITRES|L)\b/gi)];
  const last = matches[matches.length - 1];
  if (!last) return null;
  const amount = Number(last[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = last[2].toUpperCase();
  if (unit === "KG" || unit === "KGS" || unit === "L" || unit.startsWith("LT")) return Math.round(amount * 1000);
  return Math.round(amount);
}

export function chargeableGrams(input: {
  weightGrams?: number | null;
  lengthCm?: number | string | null;
  widthCm?: number | string | null;
  heightCm?: number | string | null;
  name?: string | null;
  qty: number;
}) {
  const qty = Math.max(0, input.qty);
  const stored = Number(input.weightGrams);
  const each = stored > 0 ? stored : gramsFromName(input.name || "") ?? 100;
  const dead = each * qty;
  const length = Number(input.lengthCm) || 0;
  const width = Number(input.widthCm) || 0;
  const height = Number(input.heightCm) || 0;
  const volumetric =
    length > 0 && width > 0 && height > 0
      ? ((length * width * height) / DELHIVERY_VOLUMETRIC_DIVISOR) * 1000 * qty
      : 0;
  return Math.max(100, Math.round(Math.max(dead, volumetric)));
}

export async function chargeableGramsForItems(items: Array<{ productId: number; qty: number }>) {
  if (!items.length) return 0;
  const ids = [...new Set(items.map((item) => item.productId))];
  const rows = await db
    .select({
      productId: fieldListedProducts.productId,
      weightGrams: fieldListedProducts.weightGrams,
      lengthCm: fieldListedProducts.lengthCm,
      widthCm: fieldListedProducts.widthCm,
      heightCm: fieldListedProducts.heightCm,
      name: products.name,
    })
    .from(fieldListedProducts)
    .innerJoin(products, eq(products.id, fieldListedProducts.productId))
    .where(inArray(fieldListedProducts.productId, ids));
  const byId = new Map(rows.map((row) => [row.productId, row]));
  return items.reduce((sum, item) => {
    const row = byId.get(item.productId);
    if (!row) return sum + chargeableGrams({ qty: item.qty });
    return sum + chargeableGrams({ ...row, qty: item.qty });
  }, 0);
}
