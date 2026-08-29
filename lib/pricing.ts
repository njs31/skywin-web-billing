import { calculateLineAmount } from "@/lib/gst";
import { toNumber } from "@/lib/utils";

export type BelowCostLine = {
  qty: number | string;
  rate: number | string;
  cost?: number | string | null;
  discountType?: "percent" | "value";
  discountValue?: number | string | null;
};

export type BelowCostResult = {
  belowCost: boolean;
  effectiveRate: number;
  cost: number;
};

/**
 * Compare a cart line's effective per-unit selling rate (after its discount)
 * against the product's landed cost. Used to warn the operator before they bill
 * below cost. Non-blocking — lines with no cost recorded are never flagged.
 */
export function checkBelowCost(line: BelowCostLine): BelowCostResult {
  const qty = toNumber(line.qty);
  const cost = toNumber(line.cost);
  const lineAmount = calculateLineAmount(
    qty,
    toNumber(line.rate),
    toNumber(line.discountValue),
    line.discountType ?? "percent"
  );
  const effectiveRate = qty > 0 ? lineAmount / qty : 0;
  const belowCost = cost > 0 && qty > 0 && effectiveRate < cost - 0.005;
  return {
    belowCost,
    effectiveRate: Math.round(effectiveRate * 100) / 100,
    cost: Math.round(cost * 100) / 100,
  };
}

export function isBelowCost(line: BelowCostLine): boolean {
  return checkBelowCost(line).belowCost;
}
