import { toNumber } from "@/lib/utils";

/** Starting Disc% for a quotation line: the product's default, or 0. */
export function quotationLineDiscountPercent(product: {
  discountPercent?: string | number | null;
}): number {
  return toNumber(product.discountPercent);
}
