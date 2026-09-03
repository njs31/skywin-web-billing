import { formatNumber, toNumber } from "./utils";

export type InvoiceDiscountItem = {
  qty: string | number;
  rate: string | number;
  amount: string | number;
  discountPercent?: string | number | null;
  discountType?: string | null;
  discountValue?: string | number | null;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** Line discount as a percent of qty × rate. */
export function lineDiscountPercent(item: InvoiceDiscountItem): number {
  if (toNumber(item.discountPercent) > 0) return toNumber(item.discountPercent);
  if (item.discountType === "percent") return toNumber(item.discountValue);
  const gross = toNumber(item.qty) * toNumber(item.rate);
  if (gross <= 0) return 0;
  return roundMoney((toNumber(item.discountValue) / gross) * 100);
}

/** Rupee discount implied by listed rate vs taxable amount. */
export function lineDiscountAmount(item: InvoiceDiscountItem): number {
  const gross = roundMoney(toNumber(item.qty) * toNumber(item.rate));
  const net = toNumber(item.amount);
  return Math.max(0, roundMoney(gross - net));
}

export function lineDiscountLabel(item: InvoiceDiscountItem): string {
  const amount = lineDiscountAmount(item);
  const percent = lineDiscountPercent(item);
  if (amount <= 0.004 && percent <= 0) return "";
  if (item.discountType === "value") {
    return formatNumber(amount, 2);
  }
  if (percent > 0) return `${formatNumber(percent, 2)}%`;
  if (amount > 0) return formatNumber(amount, 2);
  return "";
}

export function totalLineDiscount(items: InvoiceDiscountItem[]): number {
  return roundMoney(items.reduce((sum, item) => sum + lineDiscountAmount(item), 0));
}
