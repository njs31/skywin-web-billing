/**
 * Purchase bill totals — the one place the entry form, the saved bill and
 * the printed bill all get their tax, handling and round-off numbers from.
 *
 * Why this exists: the printed bill used to show CGST/SGST computed two ways
 * (the totals box halved the stored GST total, the HSN table rounded tax per
 * line then halved it), so the two disagreed by a few paise and neither
 * matched the supplier's invoice, where CGST and SGST are each computed on
 * the taxable value and always come out equal.
 *
 * Tax is computed per HSN + rate group: CGST = SGST = round(taxable × rate/2
 * %), IGST = round(taxable × rate %). The bill's totals are the sum of those
 * rows, so the totals box and the HSN table can no longer disagree.
 */
import { calculateLineAmount } from "./gst";

export type HandlingChargeType = "value" | "percent";

export type PurchaseTotalsLine = {
  qty: number;
  rate: number;
  gstRate: number;
  hsnCode?: string | null;
  discountType?: "percent" | "value";
  discountValue?: number;
};

export type PurchaseTotalsInput = {
  lines: PurchaseTotalsLine[];
  interstate: boolean;
  /** "value" = a rupee amount; "percent" = % of the items' taxable value. */
  handlingType?: HandlingChargeType;
  handlingValue?: number;
  /** GST % charged on the handling amount (0 = no GST). */
  handlingGstRate?: number;
};

export type PurchaseTaxRow = {
  hsn: string;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  /** True for the handling-charges row, so the bill can label it. */
  isHandling?: boolean;
};

export type PurchaseTotals = {
  /** Items' taxable value (after line discounts). */
  subtotal: number;
  /** Handling in rupees, before its GST. */
  handlingAmount: number;
  handlingGst: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** All GST: items + handling. */
  gstTotal: number;
  rows: PurchaseTaxRow[];
  /** Total before rounding to the rupee. */
  exactTotal: number;
  /** Delta applied to reach a whole rupee (can be negative). */
  roundOff: number;
  grandTotal: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function taxFor(taxable: number, rate: number, interstate: boolean) {
  if (rate <= 0 || taxable <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  if (interstate) {
    return { cgst: 0, sgst: 0, igst: round2((taxable * rate) / 100) };
  }
  const half = round2((taxable * rate) / 200);
  return { cgst: half, sgst: half, igst: 0 };
}

/** Handling in rupees from how it was entered. */
export function handlingAmountFor(
  subtotal: number,
  type: HandlingChargeType = "value",
  value = 0
): number {
  const v = Number.isFinite(value) && value > 0 ? value : 0;
  return round2(type === "percent" ? (subtotal * v) / 100 : v);
}

export function calculatePurchaseTotals(input: PurchaseTotalsInput): PurchaseTotals {
  const groups = new Map<string, { hsn: string; rate: number; taxable: number }>();
  let subtotal = 0;

  for (const line of input.lines) {
    const amount = calculateLineAmount(
      line.qty,
      line.rate,
      line.discountValue ?? 0,
      line.discountType ?? "percent"
    );
    subtotal += amount;
    const hsn = (line.hsnCode ?? "").trim() || "-";
    const rate = Number.isFinite(line.gstRate) ? line.gstRate : 0;
    const key = `${hsn}|${rate}`;
    const group = groups.get(key) ?? { hsn, rate, taxable: 0 };
    group.taxable += amount;
    groups.set(key, group);
  }
  subtotal = round2(subtotal);

  const rows: PurchaseTaxRow[] = [...groups.values()].map((g) => {
    const taxable = round2(g.taxable);
    const tax = taxFor(taxable, g.rate, input.interstate);
    return {
      hsn: g.hsn,
      rate: g.rate,
      taxable,
      ...tax,
      totalTax: round2(tax.cgst + tax.sgst + tax.igst),
    };
  });

  const handlingAmount = handlingAmountFor(
    subtotal,
    input.handlingType,
    input.handlingValue
  );
  const handlingRate = input.handlingGstRate ?? 0;
  let handlingGst = 0;
  if (handlingAmount > 0) {
    const tax = taxFor(handlingAmount, handlingRate, input.interstate);
    handlingGst = round2(tax.cgst + tax.sgst + tax.igst);
    rows.push({
      hsn: "Handling",
      rate: handlingRate,
      taxable: handlingAmount,
      ...tax,
      totalTax: handlingGst,
      isHandling: true,
    });
  }

  const cgst = round2(rows.reduce((s, r) => s + r.cgst, 0));
  const sgst = round2(rows.reduce((s, r) => s + r.sgst, 0));
  const igst = round2(rows.reduce((s, r) => s + r.igst, 0));
  const gstTotal = round2(cgst + sgst + igst);

  const exactTotal = round2(subtotal + handlingAmount + gstTotal);
  const grandTotal = Math.round(exactTotal);
  const roundOff = round2(grandTotal - exactTotal);

  return {
    subtotal,
    handlingAmount,
    handlingGst,
    cgst,
    sgst,
    igst,
    gstTotal,
    rows,
    exactTotal,
    roundOff,
    grandTotal,
  };
}
