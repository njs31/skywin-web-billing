import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { fieldProductDetails } from "@/db/schema";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { getBatchBillingRate, inclusiveSalePrice } from "@/lib/gst";
import { listDiscountedOffers, searchProductBatches, type ProductBatchSearchResult } from "@/lib/queries/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const offers = url.searchParams.get("offers") === "1";
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get("limit")) || (offers ? 40 : 20)));

  if (!q && !offers) {
    return fieldJson({ products: [] });
  }

  try {
    const rows = offers
      ? await listDiscountedOffers(limit)
      : await searchProductBatches(q, limit, { onlyInStock: false });
    const images = await offerImages(offers ? rows.map((row) => row.productId) : []);
    return fieldJson({
      products: rows.map((row) => toFieldBatch(row, offers ? images.get(row.productId) ?? null : null, offers)),
    });
  } catch (err) {
    return fieldJson(
      { error: err instanceof Error ? err.message : "Search failed" },
      500
    );
  }
}

async function offerImages(productIds: number[]) {
  const map = new Map<number, string | null>();
  if (productIds.length === 0) return map;
  const rows = await db
    .select({
      productId: fieldProductDetails.productId,
      images: fieldProductDetails.images,
    })
    .from(fieldProductDetails)
    .where(inArray(fieldProductDetails.productId, productIds));
  for (const row of rows) {
    const image = row.images.find((src) => src.trim() && !/images\.unsplash\.com/i.test(src)) ?? null;
    map.set(row.productId, image);
  }
  return map;
}

function toFieldBatch(row: ProductBatchSearchResult, image: string | null, applyDiscount: boolean) {
  const discountPercent = Number(row.discountPercent) || 0;
  const listRate = applyDiscount ? Number(row.saleRate) || 0 : getBatchBillingRate(row, "retail");
  const rate = applyDiscount
    ? Math.round(listRate * (1 - discountPercent / 100) * 100) / 100
    : listRate;
  const gst = Number(row.gstRate) || 0;
  const price = inclusiveSalePrice(rate, gst);
  const listPrice = inclusiveSalePrice(listRate, gst);
  const stock = applyDiscount
    ? Number(row.productStockQty) || 0
    : Number(row.batchId != null ? row.batchQty : row.productStockQty) || 0;
  return {
    ...row,
    rate,
    price,
    listPrice,
    discountPercent,
    image,
    stock,
    lineKey: `${row.productId}-${row.batchId ?? "none"}`,
  };
}
