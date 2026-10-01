"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { InlineLoader } from "@/components/ui/page-loader";

/**
 * Customer search. Debounces into the URL (server filters, page resets to
 * 1); remounted by the parent on every committed search.
 */
export function CustomerFilters({
  defaultQuery,
  type,
}: {
  defaultQuery: string;
  type: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (value === defaultQuery) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      if (type !== "all") params.set("type", type);
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `/customers?${query}` : "/customers");
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, defaultQuery, router, type]);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search name, phone, or GSTIN…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {isPending && <InlineLoader label="Searching customers…" />}
    </div>
  );
}
