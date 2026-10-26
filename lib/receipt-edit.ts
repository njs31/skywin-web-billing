export type ReceiptBill = {
  id: number;
  invoiceNo: string;
  date: Date | string;
  grandTotal: string;
  paidAmount: string | null;
  balance: string;
};

export type ReceiptShare = {
  id: number;
  invoiceNo: string;
  date: Date | string;
  amount: string;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Outstanding already excludes what this receipt paid. Add that share back
 * so a fully paid invoice stays editable, and a partial one shows the
 * amount this receipt can still move.
 */
export function mergeReceiptBills(
  outstanding: ReceiptBill[],
  shares: ReceiptShare[]
): ReceiptBill[] {
  const map = new Map<number, ReceiptBill>();
  for (const bill of outstanding) {
    map.set(bill.id, { ...bill });
  }
  for (const share of shares) {
    const extra = round2(asNumber(share.amount));
    if (extra <= 0) continue;
    const existing = map.get(share.id);
    if (!existing) {
      map.set(share.id, {
        id: share.id,
        invoiceNo: share.invoiceNo,
        date: share.date,
        grandTotal: "0",
        paidAmount: "0",
        balance: extra.toFixed(2),
      });
      continue;
    }
    const balance = round2(asNumber(existing.balance) + extra);
    map.set(share.id, { ...existing, balance: balance.toFixed(2) });
  }
  return [...map.values()];
}
