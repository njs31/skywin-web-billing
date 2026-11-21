/**
 * Field orders are priced by the server, not by the phone.
 *
 * The app shows the same prices the server sends (`/api/field/product-batches`), so a fair
 * client rate is either the billing rate or, for products on offer, the discounted sale rate.
 * Anything below the lower of those two is replaced with the billing rate, and the order's
 * minimum total is what the Razorpay payment must cover.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { getBatchBillingRate, inclusiveSalePrice } from "@/lib/gst";
import { listProductBatchesByIds, type ProductBatchSearchResult } from "@/lib/queries/products";

export type FieldLineIn = {
  productId: number;
  batchId?: number | null;
  qty: number;
  rate?: number;
};

export type PricedFieldLine = {
  productId: number;
  batchId: number | null;
  qty: number;
  rate: number;
  gstRate: number;
};

type RateRow = Pick<ProductBatchSearchResult, "saleRate" | "wholesaleRate" | "batchSaleRate" | "discountPercent" | "gstRate">;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Billing rate and the lowest rate the app may legitimately show for this batch row. */
export function legitimateRates(row: RateRow) {
  const billing = getBatchBillingRate(row, "retail");
  const discount = Number(row.discountPercent) || 0;
  const offer = discount > 0 ? round2((Number(row.saleRate) || 0) * (1 - discount / 100)) : Infinity;
  return { billing, floor: Math.min(billing, offer) };
}

/** The rate to bill: the client's rate if it isn't below the legitimate floor, else the billing rate. */
export function billedRate(row: RateRow, clientRate: number | undefined) {
  const { billing, floor } = legitimateRates(row);
  if (clientRate != null && Number.isFinite(clientRate) && clientRate > 0 && clientRate >= floor - 0.01) {
    return round2(clientRate);
  }
  return billing;
}

/** Sum of GST-inclusive line prices at the legitimate floor rate. */
export function minimumLineTotal(row: RateRow, qty: number) {
  return round2(inclusiveSalePrice(legitimateRates(row).floor, row.gstRate) * qty);
}

export async function priceFieldLines(lines: FieldLineIn[]) {
  const clean = lines
    .map((l) => ({
      productId: Number(l.productId),
      batchId: l.batchId == null || (l.batchId as unknown) === "" ? null : Number(l.batchId),
      qty: Math.max(1, Math.floor(Number(l.qty) || 1)),
      rate: l.rate != null ? Number(l.rate) : undefined,
    }))
    .filter((l) => Number.isInteger(l.productId) && l.productId > 0);
  if (!clean.length) throw new Error("No items provided");

  const rows = await listProductBatchesByIds(clean.map((l) => l.productId));
  let minimumTotal = 0;
  const priced: PricedFieldLine[] = clean.map((line) => {
    const forProduct = rows.filter((r) => r.productId === line.productId);
    const row = forProduct.find((r) => line.batchId != null && r.batchId === line.batchId) ?? forProduct[0];
    if (!row) throw new Error(`Product ${line.productId} is not available`);
    minimumTotal += minimumLineTotal(row, line.qty);
    return {
      productId: line.productId,
      batchId: line.batchId,
      qty: line.qty,
      rate: billedRate(row, line.rate),
      gstRate: Number(row.gstRate) || 0,
    };
  });
  return { lines: priced, minimumTotal: round2(minimumTotal) };
}

/** Compact cart for Razorpay order notes (max 256 chars), so a webhook can rebuild the order. */
export function packCart(lines: Array<{ productId: number; batchId?: number | null; qty: number }>) {
  const text = lines.map((l) => `${l.productId}:${l.batchId ?? ""}:${l.qty}`).join(",");
  return text.length <= 256 ? text : null;
}

export function unpackCart(text: string | undefined | null): FieldLineIn[] {
  if (!text) return [];
  return text
    .split(",")
    .map((part) => {
      const [p, b, q] = part.split(":");
      return { productId: Number(p), batchId: b ? Number(b) : null, qty: Number(q) || 1 };
    })
    .filter((l) => Number.isInteger(l.productId) && l.productId > 0);
}

/** Reward points the farmer can put toward an order (the payment may be lower by this much). */
export async function rewardPointsFor(phone: string) {
  if (phone.length !== 10) return 0;
  const [row] = await db
    .select({ points: customers.rewardPoints })
    .from(customers)
    .where(sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) = ${phone}`)
    .limit(1);
  return Math.max(0, Number(row?.points) || 0);
}
