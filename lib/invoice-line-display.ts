import { inclusiveSalePrice } from "@/lib/gst";
import { lineDiscountAmount, type InvoiceDiscountItem } from "@/lib/invoice-discount";
import { formatNumber, formatRate, toNumber } from "@/lib/utils";

/**
 * Display-only values for one invoice line (Jai, 9 Nov 2026):
 *   Basic  = the GST-inclusive per-unit price that used to sit in brackets
 *            under the amount (sale rate + GST, before any discount).
 *   GST    = just the GST percentage.
 *   Amount = the line's final amount: taxable value after discount, plus GST.
 *
 * None of this changes what the bill charges. Invoice totals (taxable,
 * CGST/SGST/IGST, round off, grand total) still come from the saved sale.
 */
export type InvoiceLineDisplayItem = InvoiceDiscountItem & {
  gstRate: string | number;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** GST-inclusive per-unit price before discount (the old bracket value). */
export function lineBasic(item: { rate: string | number; gstRate: string | number }): number {
  return inclusiveSalePrice(item.rate, item.gstRate);
}

export function lineGstLabel(item: { gstRate: string | number }): string {
  return `${formatRate(toNumber(item.gstRate))}%`;
}

/** Line amount after discount, with GST added. */
export function lineFinalAmount(item: { amount: string | number; gstRate: string | number }): number {
  const taxable = toNumber(item.amount);
  const gst = toNumber(item.gstRate);
  return roundMoney(taxable * (1 + gst / 100));
}

/** Per-unit final price (after discount, with GST). 0 for a zero-qty line. */
export function lineFinalRate(item: {
  qty: string | number;
  amount: string | number;
  gstRate: string | number;
}): number {
  const qty = toNumber(item.qty);
  if (qty <= 0) return 0;
  // Per unit first, then round — so an undiscounted line reads exactly its MRP.
  return roundMoney((toNumber(item.amount) / qty) * (1 + toNumber(item.gstRate) / 100));
}

/**
 * Wholesale invoices carry two discount columns: percent and rupees.
 *  - Entered as a percent: "10%" and the rupees that percent took off.
 *  - Entered as a rupee amount: "0%" and that amount.
 *  - No discount (the price itself is the deal): "0" in both.
 */
export function wholesaleDiscountColumns(item: InvoiceDiscountItem): {
  percent: string;
  amount: string;
} {
  const amount = lineDiscountAmount(item);
  let percent = 0;
  if (item.discountType !== "value") {
    percent =
      toNumber(item.discountPercent) > 0
        ? toNumber(item.discountPercent)
        : toNumber(item.discountValue);
  }
  if (amount <= 0.004) percent = 0;
  return {
    percent: percent > 0 ? `${formatRate(percent)}%` : "0",
    amount: amount > 0.004 ? formatNumber(amount, 2) : "0",
  };
}
