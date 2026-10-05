"use client";

import { useEffect, useState } from "react";
import { getProductChangeLogs } from "@/lib/actions/products";
import { formatDateTimeIST } from "@/lib/utils";
import type { ProductChangeSummary } from "@/lib/product-changelog";

export function ProductChangeLog({ productId }: { productId: number }) {
  const [rows, setRows] = useState<
    Array<{ id: number; userName: string; changedAt: Date | string; summary: string }>
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProductChangeLogs(productId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!loaded) {
    return <p className="px-3 py-2 text-xs text-slate-500">Loading change log…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-slate-500">No product edits logged yet.</p>
    );
  }

  return (
    <div className="space-y-2 px-3 py-2">
      <p className="text-xs font-semibold text-slate-700">Change log</p>
      {rows.map((row) => {
        let summary: ProductChangeSummary = {};
        try {
          summary = JSON.parse(row.summary) as ProductChangeSummary;
        } catch {
          summary = {};
        }
        return (
          <div key={row.id} className="rounded border border-slate-200 bg-white px-2 py-1.5">
            <p className="text-[11px] font-medium text-slate-800">
              {row.userName}{" "}
              <span className="font-normal text-slate-500">
                · {formatDateTimeIST(row.changedAt)}
              </span>
            </p>
            <ul className="mt-0.5 text-[11px] text-slate-600">
              {Object.entries(summary).map(([field, change]) => (
                <li key={field}>
                  {field}: {change.from || "—"} → {change.to || "—"}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
