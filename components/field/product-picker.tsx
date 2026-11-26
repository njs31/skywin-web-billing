"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { searchBillingProducts } from "@/lib/actions/field";
import { buttonClass, inputClass } from "@/components/field/kit";

export type PickedProduct = { id: number; name: string };

/** Search a billing product and pick one (or clear it). Used by Banners and Notifications. */
export function ProductPicker({
  id,
  value,
  onChange,
  text,
}: {
  id: string;
  value: PickedProduct | null;
  onChange: (value: PickedProduct | null) => void;
  text: { placeholder: string; search: string; none: string; pick: string; clear: string };
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ productId: number; name: string; sku: string | null }> | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function search() {
    const query = q.trim();
    if (!query) return;
    setError("");
    start(async () => {
      try {
        const rows = await searchBillingProducts(query);
        const seen = new Set<number>();
        setHits(
          rows
            .filter((r) => (seen.has(r.productId) ? false : (seen.add(r.productId), true)))
            .map((r) => ({ productId: r.productId, name: r.name, sku: r.sku }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    });
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#1E3317]/10 bg-[#F4F8EF] px-3 py-2 text-sm">
        <span className="min-w-0 truncate font-medium text-[#1E3317]">
          {value.name} <span className="text-xs text-[#5E6B62]">#{value.id}</span>
        </span>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => onChange(null)}>
          <X aria-hidden /> {text.clear}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          id={id}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder={text.placeholder}
          className={inputClass}
        />
        <button type="button" className={buttonClass("secondary")} disabled={pending || !q.trim()} onClick={search}>
          <Search aria-hidden /> {text.search}
        </button>
      </div>
      {error ? <p className="text-xs text-[#8E3B34]">{error}</p> : null}
      {hits && hits.length === 0 ? <p className="text-xs text-[#5E6B62]">{text.none}</p> : null}
      {hits && hits.length > 0 ? (
        <ul className="max-h-56 divide-y divide-[#1E3317]/8 overflow-y-auto rounded-xl border border-[#1E3317]/10 bg-white">
          {hits.map((hit) => (
            <li key={hit.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{hit.name}</span>
                <span className="text-xs text-[#5E6B62]">{hit.sku || `ID ${hit.productId}`}</span>
              </span>
              <button
                type="button"
                className={buttonClass("primary", "sm")}
                onClick={() => {
                  onChange({ id: hit.productId, name: hit.name });
                  setHits(null);
                  setQ("");
                }}
              >
                {text.pick}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
