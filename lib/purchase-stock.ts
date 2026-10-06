/** Stock key for one product + batch on a purchase bill. */
export function purchaseStockKey(productId: number, batchNumber: string) {
  return `${productId}\t${batchNumber.trim().toUpperCase()}`;
}

export type PurchaseStockDelta = {
  key: string;
  productId: number;
  batchNumber: string;
  oldQty: number;
  newQty: number;
  delta: number;
};

/**
 * Net qty change per product/batch when a purchase bill is edited.
 * Saving the same bill (rate/GST only) yields delta 0, so already-sold
 * units are not deducted and re-added.
 */
export function purchaseStockDeltas(
  previous: Map<string, number>,
  next: Map<string, number>
): PurchaseStockDelta[] {
  const keys = new Set([...previous.keys(), ...next.keys()]);
  const out: PurchaseStockDelta[] = [];
  for (const key of keys) {
    const tab = key.indexOf("\t");
    const productId = Number(key.slice(0, tab));
    const batchNumber = key.slice(tab + 1);
    const oldQty = previous.get(key) ?? 0;
    const newQty = next.get(key) ?? 0;
    out.push({
      key,
      productId,
      batchNumber,
      oldQty,
      newQty,
      delta: newQty - oldQty,
    });
  }
  return out;
}
