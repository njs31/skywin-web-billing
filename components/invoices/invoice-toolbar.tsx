"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Calendar, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineLoader } from "@/components/ui/page-loader";
import type { SaleListBillType, SaleListSort } from "@/lib/queries/sales";

export type InvoiceToolbarState = {
  q: string;
  type: SaleListBillType;
  day: string;
  sort: SaleListSort;
  pageSize: number;
};

function href(params: InvoiceToolbarState & { page?: number }): string {
  const query = new URLSearchParams();
  if (params.q.trim()) query.set("q", params.q.trim());
  if (params.type !== "all") query.set("type", params.type);
  if (params.day) query.set("day", params.day);
  if (params.sort !== "newest") query.set("sort", params.sort);
  if ((params.page ?? 1) > 1) query.set("page", String(params.page));
  if (params.pageSize !== 20) query.set("pageSize", String(params.pageSize));
  const s = query.toString();
  return s ? `/invoices?${s}` : "/invoices";
}

function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function istYesterday(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Kolkata" }
  );
}

type DayChoice = "all" | "today" | "yesterday" | "custom";

function dayChoiceFor(day: string, today: string, yesterday: string): DayChoice {
  if (!day) return "all";
  if (day === today) return "today";
  if (day === yesterday) return "yesterday";
  return "custom";
}

/**
 * Compact Sale Book toolbar: search, day, type and sort. Everything
 * navigates (filter changes reset to page 1); typing debounces. The
 * parent remounts on every committed search via key.
 */
export function InvoiceToolbar({
  defaultQuery,
  defaultType,
  defaultDay,
  defaultSort,
  pageSize,
}: {
  defaultQuery: string;
  defaultType: SaleListBillType;
  defaultDay: string;
  defaultSort: SaleListSort;
  pageSize: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultQuery);
  const [isPending, startTransition] = useTransition();
  const today = istToday();
  const yesterday = istYesterday();

  const go = (next: Partial<InvoiceToolbarState> & { page?: number }) => {
    startTransition(() => {
      router.replace(
        href({
          q: value,
          type: defaultType,
          day: defaultDay,
          sort: defaultSort,
          pageSize,
          ...next,
        })
      );
    });
  };

  useEffect(() => {
    if (value === defaultQuery) return;
    const timer = setTimeout(() => {
      startTransition(() => {
        router.replace(
          href({ q: value, type: defaultType, day: defaultDay, sort: defaultSort, pageSize })
        );
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, defaultQuery, router, defaultType, defaultDay, defaultSort, pageSize]);

  const dayChoice = dayChoiceFor(defaultDay, today, yesterday);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="invoice-search" className="sr-only">
          Search invoices
        </Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            id="invoice-search"
            placeholder="Search invoice no., customer, or amount…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        {isPending && <InlineLoader label="Searching invoices…" />}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-36">
          <Label htmlFor="invoice-day" className="sr-only">
            Filter by day
          </Label>
          <Select
            value={dayChoice}
            onValueChange={(choice: DayChoice) => {
              if (choice === "all") go({ day: "" });
              else if (choice === "today") go({ day: today });
              else if (choice === "yesterday") go({ day: yesterday });
              // "custom" just reveals the date picker below.
            }}
          >
            <SelectTrigger id="invoice-day" aria-label="Filter by day" className="h-9">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="custom">Custom date…</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dayChoice === "custom" && (
          <div className="flex items-center gap-1.5">
            <Calendar aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
            <Input
              type="date"
              aria-label="Custom day"
              value={defaultDay}
              onChange={(e) =>
                go({ day: e.target.value })
              }
              className="h-9 w-auto"
            />
          </div>
        )}

        <div className="w-32">
          <Label htmlFor="invoice-type" className="sr-only">
            Filter by type
          </Label>
          <Select
            value={defaultType}
            onValueChange={(type: SaleListBillType) => go({ type })}
          >
            <SelectTrigger id="invoice-type" aria-label="Filter by type" className="h-9">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
              <SelectItem value="others">Others</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-44">
          <Label htmlFor="invoice-sort" className="sr-only">
            Sort invoices
          </Label>
          <Select
            value={defaultSort}
            onValueChange={(sort: SaleListSort) => go({ sort })}
          >
            <SelectTrigger id="invoice-sort" aria-label="Sort invoices" className="h-9">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="amount-desc">Amount: High to Low</SelectItem>
              <SelectItem value="amount-asc">Amount: Low to High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
