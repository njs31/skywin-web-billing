"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { InlineLoader } from "@/components/ui/page-loader";

export function ProductSearch({
  defaultQuery,
  status,
  sort,
  dir,
}: {
  defaultQuery: string;
  status?: string;
  sort?: string;
  dir?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultQuery);
  const [isPending, startTransition] = useTransition();
  const skipFirst = useRef(true);

  useEffect(() => {
    setValue(defaultQuery);
  }, [defaultQuery]);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      if (status === "inactive") params.set("status", "inactive");
      if (sort) params.set("sort", sort);
      if (dir) params.set("dir", dir);
      const next = `/products?${params.toString()}`;
      startTransition(() => {
        router.replace(next);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, router, status, sort, dir]);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search products..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {isPending && <InlineLoader label="Searching products…" />}
    </div>
  );
}
