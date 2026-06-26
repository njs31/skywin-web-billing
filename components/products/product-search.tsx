"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export function ProductSearch({ defaultQuery }: { defaultQuery: string }) {
  const router = useRouter();

  return (
    <Input
      placeholder="Search products..."
      defaultValue={defaultQuery}
      onChange={(e) => {
        const q = e.target.value;
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        router.replace(`/products?${params.toString()}`);
      }}
    />
  );
}
