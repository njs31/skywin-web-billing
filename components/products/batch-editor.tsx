"use client";

import { useEffect, useState, useTransition } from "react";
import { getProductBatches, updateBatch } from "@/lib/actions/products";
import { toNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";

type Batch = {
  id: number;
  batchNumber: string;
  qty: string;
  purchaseRate: string | null;
  saleRate: string | null;
  saleRateOverridden: boolean;
  expiryDate: string | null;
  notes: string | null;
};

export function BatchEditor({ productId }: { productId: number }) {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const load = () => {
    getProductBatches(productId)
      .then((rows) => setBatches(rows as Batch[]))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load batches"));
  };

  useEffect(load, [productId]);

  const [draft, setDraft] = useState<
    Record<number, { saleRate: string; purchaseRate: string; expiryDate: string }>
  >({});

  const fieldFor = (b: Batch) =>
    draft[b.id] ?? {
      saleRate: String(toNumber(b.saleRate)),
      purchaseRate: String(toNumber(b.purchaseRate)),
      expiryDate: b.expiryDate ?? "",
    };

  const set = (id: number, key: string, value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...fieldFor(batches!.find((b) => b.id === id)!), ...d[id], [key]: value } }));

  const save = (b: Batch) => {
    const f = fieldFor(b);
    setError("");
    startTransition(async () => {
      try {
        await updateBatch(b.id, {
          saleRate: f.saleRate === "" ? undefined : parseFloat(f.saleRate),
          purchaseRate: f.purchaseRate === "" ? undefined : parseFloat(f.purchaseRate),
          expiryDate: f.expiryDate.trim() || null,
        });
        setDraft((d) => {
          const n = { ...d };
          delete n[b.id];
          return n;
        });
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save batch");
      }
    });
  };

  if (error) return <p className="p-3 text-xs text-red-600">{error}</p>;
  if (!batches) return <p className="p-3 text-xs text-slate-400">Loading batches…</p>;
  if (batches.length === 0)
    return <p className="p-3 text-xs text-slate-400">No batches for this product.</p>;

  return (
    <div className="space-y-1.5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Batches — edit each independently
      </p>
      <div className="grid grid-cols-[1fr_5rem_6rem_6rem_8rem_2.5rem] gap-2 text-[11px] font-medium text-slate-500">
        <span>Batch</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Pur. Rate</span>
        <span className="text-right">Sale Rate</span>
        <span>Expiry</span>
        <span />
      </div>
      {batches.map((b) => {
        const f = fieldFor(b);
        return (
          <div
            key={b.id}
            className="grid grid-cols-[1fr_5rem_6rem_6rem_8rem_2.5rem] items-center gap-2"
          >
            <span className="font-mono text-xs">
              {b.batchNumber}
              {b.saleRateOverridden && (
                <span className="ml-1 rounded bg-emerald-50 px-1 text-[9px] font-semibold text-emerald-700">
                  custom price
                </span>
              )}
            </span>
            <span className="text-right text-xs">{toNumber(b.qty)}</span>
            <Input
              type="number"
              step="0.01"
              className="h-7 text-right text-xs"
              value={f.purchaseRate}
              onChange={(e) => set(b.id, "purchaseRate", e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              className="h-7 text-right text-xs"
              value={f.saleRate}
              onChange={(e) => set(b.id, "saleRate", e.target.value)}
            />
            <Input
              type="date"
              className="h-7 text-xs"
              value={f.expiryDate}
              onChange={(e) => set(b.id, "expiryDate", e.target.value)}
            />
            <Button
              size="icon"
              className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700"
              disabled={isPending}
              onClick={() => save(b)}
              title="Save batch"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
