/**
 * Stock holds, the shared core: reading active holds and taking them out of a stock snapshot.
 *
 * A hold is stock set aside while a Field app customer pays. Every seller (POS counter, Field
 * app, Qwicks) builds its stock snapshot through lockProductsWithBatches, which subtracts the
 * holds of other orders here, so nobody can sell a unit someone else is paying for.
 *
 * Pure apart from activeHolds(); unit-tested in lib/stock-holds.test.ts.
 */
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { stockHolds } from "@/db/schema";

/** How long a checkout keeps its stock. Long enough for a slow UPI approval. */
export const HOLD_MINUTES = 15;

export type HoldRow = { productId: number; batchId: number | null; qty: number };

type BatchLike = { batchId: number; qty: number };
type InfoLike = { batches: BatchLike[]; held?: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

// Any drizzle executor: db or a transaction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = { select: (...args: any[]) => any };

/** Active, unexpired holds on these products, except the ones belonging to `ownKey`. */
export async function activeHolds(exec: Executor, productIds: number[], ownKey?: string | null): Promise<HoldRow[]> {
  if (!productIds.length) return [];
  const conditions = [
    inArray(stockHolds.productId, productIds),
    eq(stockHolds.status, "active"),
    gt(stockHolds.expiresAt, sql`now()`),
  ];
  if (ownKey) conditions.push(ne(stockHolds.holdKey, ownKey));
  const rows = (await exec
    .select({ productId: stockHolds.productId, batchId: stockHolds.batchId, qty: stockHolds.qty })
    .from(stockHolds)
    .where(and(...conditions))) as Array<{ productId: number; batchId: number | null; qty: string | number }>;
  return rows.map((r) => ({ productId: r.productId, batchId: r.batchId, qty: Number(r.qty) || 0 }));
}

/**
 * Takes holds out of a stock snapshot, in place. Batches must already be in selling (FEFO)
 * order. A hold on a named batch comes off that batch; a hold on the product comes off the
 * batches in FEFO order, the same way a sale would take it. Sets `held` on each product.
 */
export function applyHolds<T extends InfoLike>(productInfo: Map<number, T>, holds: HoldRow[]) {
  for (const info of productInfo.values()) info.held = 0;
  // Batch-pinned holds first, so product-level holds only use what is left.
  const ordered = [...holds].sort((a, b) => Number(a.batchId == null) - Number(b.batchId == null));
  for (const hold of ordered) {
    const info = productInfo.get(hold.productId);
    if (!info || hold.qty <= 0) continue;
    info.held = round2((info.held ?? 0) + hold.qty);
    let need = hold.qty;
    const targets = hold.batchId != null ? info.batches.filter((b) => b.batchId === hold.batchId) : info.batches;
    for (const batch of targets) {
      if (need <= 0) break;
      const take = Math.min(batch.qty, need);
      batch.qty = round2(batch.qty - take);
      need = round2(need - take);
    }
    // A pinned hold whose batch ran short still holds product stock elsewhere.
    if (need > 0 && hold.batchId != null) {
      for (const batch of info.batches) {
        if (need <= 0) break;
        const take = Math.min(batch.qty, need);
        batch.qty = round2(batch.qty - take);
        need = round2(need - take);
      }
    }
  }
  for (const info of productInfo.values()) info.batches = info.batches.filter((b) => b.qty > 0);
  return productInfo;
}

export type CartLine = { productId: number; batchId: number | null; qty: number };
export type Shortage = { productId: number; batchId: number | null; name: string; requested: number; available: number };

/**
 * Every line the snapshot cannot fill, in one pass (not just the first), so the app can tell
 * the customer exactly what changed. Lines for the same product/batch share the stock.
 */
export function findShortages(
  productInfo: Map<number, { name: string; batches: BatchLike[] }>,
  lines: CartLine[]
): Shortage[] {
  const remaining = new Map<number, number>();
  for (const info of productInfo.values()) for (const b of info.batches) remaining.set(b.batchId, b.qty);
  const shortages: Shortage[] = [];
  for (const line of lines) {
    const info = productInfo.get(line.productId);
    const name = info?.name ?? `Product ${line.productId}`;
    const batches = info?.batches ?? [];
    const pool = line.batchId != null ? batches.filter((b) => b.batchId === line.batchId) : batches;
    const available = round2(pool.reduce((sum, b) => sum + (remaining.get(b.batchId) ?? 0), 0));
    if (available < line.qty) {
      shortages.push({ productId: line.productId, batchId: line.batchId, name, requested: line.qty, available: Math.max(0, available) });
      continue;
    }
    let need = line.qty;
    for (const b of pool) {
      if (need <= 0) break;
      const left = remaining.get(b.batchId) ?? 0;
      const take = Math.min(left, need);
      remaining.set(b.batchId, round2(left - take));
      need = round2(need - take);
    }
  }
  return shortages;
}

/** Marks an order's holds as sold. Call inside the sale's transaction. */
export async function consumeHolds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exec: { update: (...args: any[]) => any },
  holdKey: string
) {
  await exec
    .update(stockHolds)
    .set({ status: "consumed" })
    .where(and(eq(stockHolds.holdKey, holdKey), eq(stockHolds.status, "active")));
}

/** Suffix for stock errors when part of the stock is held for app payments. */
export function heldNote(held: number | undefined) {
  if (!held || held <= 0) return "";
  return ` (${held} held for a SkyWin app payment for up to ${HOLD_MINUTES} minutes)`;
}
