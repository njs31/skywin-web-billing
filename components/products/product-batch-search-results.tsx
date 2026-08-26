"use client";

import { formatCurrency, toNumber } from "@/lib/utils";
import { getBatchBillingRate } from "@/lib/gst";
import type { ProductBatchSearchResult } from "@/lib/queries/products";

type Props = {
  results: ProductBatchSearchResult[];
  onSelect: (row: ProductBatchSearchResult) => void;
  /** Which rate to show on the right (POS uses sale/wholesale) */
  rateMode?: "sale" | "purchase" | "wholesale";
  emptyHint?: string;
};

function formatExpiry(value: string | null) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export function ProductBatchSearchResults({
  results,
  onSelect,
  rateMode = "sale",
}: Props) {
  if (results.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="grid grid-cols-[minmax(0,1.4fr)_0.7fr_0.55fr_0.7fr_0.65fr] gap-2 border-b bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <span>Product</span>
        <span>Batch</span>
        <span className="text-right">Qty</span>
        <span>Expiry</span>
        <span className="text-right">Rate</span>
      </div>
      <div className="max-h-72 overflow-auto">
        {results.map((row) => {
          const qty = toNumber(row.batchQty || row.productStockQty);
          const rate =
            rateMode === "purchase"
              ? toNumber(row.batchPurchaseRate ?? row.purchaseRate)
              : getBatchBillingRate(
                  row,
                  rateMode === "wholesale" ? "wholesale" : "sale"
                );

          return (
            <button
              key={`${row.productId}-${row.batchId ?? "none"}`}
              type="button"
              className="grid w-full grid-cols-[minmax(0,1.4fr)_0.7fr_0.55fr_0.7fr_0.65fr] gap-2 border-b border-slate-100 px-3 py-2.5 text-left hover:bg-emerald-50"
              onClick={() => onSelect(row)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {row.name}
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {[row.sku, row.barcode].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              <span className="self-center font-mono text-xs font-semibold text-slate-700">
                {row.batchNumber ?? "-"}
              </span>
              <span
                className={`self-center text-right text-sm font-semibold ${
                  qty <= 0 ? "text-red-600" : "text-slate-800"
                }`}
              >
                {qty}
              </span>
              <span className="self-center text-xs text-slate-600">
                {formatExpiry(row.batchExpiry)}
              </span>
              <span className="self-center text-right text-sm font-semibold text-emerald-700">
                {formatCurrency(rate)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
