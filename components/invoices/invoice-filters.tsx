"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { InlineLoader } from "@/components/ui/page-loader";

function invoicesHref(params: {
  q: string;
  type: string;
  day: string;
  sort: string;
}): string {
  const query = new URLSearchParams();
  if (params.q.trim()) query.set("q", params.q.trim());
  if (params.type !== "all") query.set("type", params.type);
  if (params.day) query.set("day", params.day);
  if (params.sort !== "newest") query.set("sort", params.sort);
  const s = query.toString();
  return s ? `/invoices?${s}` : "/invoices";
}

/**
 * Invoice search + day picker. The parent remounts this on every committed
 * search (key={filter.q}), so the input is simply initialized from props —
 * typing debounces into the URL (server filters); the date picker and
 * Clear navigate immediately. All other active filters are preserved.
 */
export function InvoiceFilters({
  defaultQuery,
  defaultDay,
  type,
  sort,
}: {
  defaultQuery: string;
  defaultDay: string;
  type: string;
  sort: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultQuery);
  const [isPending, startTransition] = useTransition();

  // The parent remounts on every committed search, so reaching this effect
  // with value === defaultQuery means "already showing it" — navigate only
  // on genuine edits. No refs, no swallowed keystrokes.
  useEffect(() => {
    if (value === defaultQuery) return;
    const timer = setTimeout(() => {
      startTransition(() => {
        router.replace(invoicesHref({ q: value, type, day: defaultDay, sort }));
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, defaultQuery, router, type, defaultDay, sort]);

  function goDay(day: string) {
    startTransition(() => {
      router.replace(invoicesHref({ q: value, type, day, sort }));
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="space-y-2">
        <Input
          placeholder="Search invoice no., customer, or amount…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {isPending && <InlineLoader label="Searching invoices…" />}
      </div>
      <div className="flex items-center gap-2">
        <Input
          key={defaultDay}
          type="date"
          aria-label="Show invoices of a day"
          defaultValue={defaultDay}
          onChange={(e) => goDay(e.target.value)}
          className="w-auto"
        />
        {defaultDay && (
          <button
            type="button"
            onClick={() => goDay("")}
            className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
