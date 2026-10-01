import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { SaleListFilter } from "@/lib/queries/sales";
import { InvoicePageSize } from "./invoices-page-size";

function pageHref(
  filter: Omit<SaleListFilter, "page" | "pageSize">,
  page: number,
  pageSize: number
): string {
  const query = new URLSearchParams();
  if (filter.q) query.set("q", filter.q);
  if (filter.billType !== "all") query.set("type", filter.billType);
  if (filter.day) query.set("day", filter.day);
  if (filter.sort !== "newest") query.set("sort", filter.sort);
  if (page > 1) query.set("page", String(page));
  if (pageSize !== 20) query.set("pageSize", String(pageSize));
  const s = query.toString();
  return s ? `/invoices?${s}` : "/invoices";
}

/** Compact page window: 1 … 4 5 6 … 63. Server links, no client state. */
function pageWindow(page: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const window = new Set([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
  const pages = [...window].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Pagination footer: range text, rows-per-page, numbered links. Every
 * control is a plain link, so each page is a real server-rendered URL.
 */
export function InvoicesPagination({
  filter,
  page,
  pageSize,
  total,
}: {
  filter: Omit<SaleListFilter, "page" | "pageSize">;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500" aria-live="polite">
        Showing {from}–{to} of {total.toLocaleString("en-IN")}{" "}
        {total === 1 ? "invoice" : "invoices"}
      </p>

      <div className="flex items-center gap-2">
        <Label htmlFor="rows-per-page" className="text-sm text-slate-500">
          Rows
        </Label>
        <InvoicePageSize filter={filter} pageSize={pageSize} />
      </div>

      <nav aria-label="Invoice pages" className="flex items-center gap-1">
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={current <= 1}
          aria-label="Previous page"
        >
          <Link
            href={pageHref(filter, current - 1, pageSize)}
            aria-disabled={current <= 1}
            tabIndex={current <= 1 ? -1 : undefined}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        {pageWindow(current, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-slate-400" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={p}
              asChild
              variant={p === current ? "default" : "ghost"}
              size="sm"
              aria-label={`Page ${p}`}
              aria-current={p === current ? "page" : undefined}
            >
              <Link href={pageHref(filter, p, pageSize)}>{p}</Link>
            </Button>
          )
        )}
        <Button
          asChild
          variant="outline"
          size="sm"
          disabled={current >= totalPages}
          aria-label="Next page"
        >
          <Link
            href={pageHref(filter, current + 1, pageSize)}
            aria-disabled={current >= totalPages}
            tabIndex={current >= totalPages ? -1 : undefined}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </nav>
    </div>
  );
}
