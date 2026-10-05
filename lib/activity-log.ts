/** Signed qty for stock logs: +2, -1.5 */
export function formatSignedQty(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const sign = n > 0 ? "+" : "-";
  const abs = Math.abs(n);
  const body =
    Math.abs(abs - Math.round(abs)) < 0.0001
      ? String(Math.round(abs))
      : String(Math.round(abs * 100) / 100);
  return `${sign}${body}`;
}

export function stockDeltaMessage(
  userName: string,
  productName: string,
  qtyDelta: number
): string {
  return `${userName} updated the stock of ${productName} as ${formatSignedQty(qtyDelta)}`;
}

export function stockSetMessage(
  userName: string,
  productName: string,
  qty: number | string
): string {
  return `${userName} updated the stock of ${productName} to ${qty}`;
}

export function labelsPrintedMessage(
  userName: string,
  labelCount: number,
  productName?: string | null
): string {
  const n = Math.floor(labelCount);
  if (productName?.trim()) {
    return `${userName} printed ${n} labels of ${productName.trim()}`;
  }
  return `${userName} printed ${n} labels`;
}

export function productUpdatedMessage(
  userName: string,
  productName: string,
  changes: string[]
): string {
  if (changes.length === 0) {
    return `${userName} updated ${productName}`;
  }
  return `${userName} updated ${productName} (${changes.join(", ")})`;
}
