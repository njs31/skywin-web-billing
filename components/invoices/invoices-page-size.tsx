"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SaleListFilter } from "@/lib/queries/sales";

/** Rows-per-page switch. Navigates (resets to page 1), like everything here. */
export function InvoicePageSize({
  filter,
  pageSize,
}: {
  filter: Omit<SaleListFilter, "page" | "pageSize">;
  pageSize: number;
}) {
  const router = useRouter();
  return (
    <Select
      value={String(pageSize)}
      onValueChange={(value) => {
        const query = new URLSearchParams();
        if (filter.q) query.set("q", filter.q);
        if (filter.billType !== "all") query.set("type", filter.billType);
        if (filter.day) query.set("day", filter.day);
        if (filter.sort !== "newest") query.set("sort", filter.sort);
        if (value !== "20") query.set("pageSize", value);
        const s = query.toString();
        router.replace(s ? `/invoices?${s}` : "/invoices");
      }}
    >
      <SelectTrigger
        id="rows-per-page"
        aria-label="Rows per page"
        className="h-8 w-20"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="20">20</SelectItem>
        <SelectItem value="50">50</SelectItem>
        <SelectItem value="100">100</SelectItem>
      </SelectContent>
    </Select>
  );
}
