import { toNumber } from "@/lib/utils";

export type ProductChangeField = {
  from: string;
  to: string;
};

export type ProductChangeSummary = Record<string, ProductChangeField>;

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  saleRate: "Sale rate",
  purchaseRate: "Purchase rate",
  wholesaleRate: "Wholesale rate",
  gstRate: "GST %",
  stockQty: "Stock",
  reorderLevel: "Reorder level",
  mrp: "MRP",
  discountPercent: "Discount %",
  hsnCode: "HSN",
  barcode: "Barcode",
  expiryDate: "Expiry",
  unit: "Unit",
};

function asText(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value).trim();
}

function moneyKey(key: string): boolean {
  return (
    key === "saleRate" ||
    key === "purchaseRate" ||
    key === "wholesaleRate" ||
    key === "gstRate" ||
    key === "stockQty" ||
    key === "reorderLevel" ||
    key === "mrp" ||
    key === "discountPercent"
  );
}

function sameValue(key: string, from: unknown, to: unknown): boolean {
  if (moneyKey(key)) {
    const a =
      from == null || from === ""
        ? null
        : toNumber(from as string | number);
    const b =
      to == null || to === "" ? null : toNumber(to as string | number);
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return Math.abs(a - b) < 0.0001;
  }
  return asText(from) === asText(to);
}

export function diffProductFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): ProductChangeSummary {
  const summary: ProductChangeSummary = {};
  for (const key of Object.keys(after)) {
    if (!(key in FIELD_LABELS)) continue;
    if (sameValue(key, before[key], after[key])) continue;
    summary[FIELD_LABELS[key] ?? key] = {
      from: asText(before[key]),
      to: asText(after[key]),
    };
  }
  return summary;
}

export function hasProductChanges(summary: ProductChangeSummary): boolean {
  return Object.keys(summary).length > 0;
}
