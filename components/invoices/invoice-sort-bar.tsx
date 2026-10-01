import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaleListBillType, SaleListSort } from "@/lib/queries/sales";

const TYPES: Array<{ key: SaleListBillType; label: string }> = [
  { key: "all", label: "All" },
  { key: "retail", label: "Retail" },
  { key: "wholesale", label: "Wholesale" },
  { key: "others", label: "Others" },
];

const SORTS: Array<{ key: SaleListSort; label: string; dir: "asc" | "desc" }> = [
  { key: "newest", label: "Newest", dir: "desc" },
  { key: "oldest", label: "Oldest", dir: "asc" },
  { key: "amount-desc", label: "Amount", dir: "desc" },
  { key: "amount-asc", label: "Amount", dir: "asc" },
];

function href(params: {
  q: string;
  type: string;
  day: string;
  sort: string;
}): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.type !== "all") query.set("type", params.type);
  if (params.day) query.set("day", params.day);
  if (params.sort !== "newest") query.set("sort", params.sort);
  const s = query.toString();
  return s ? `/invoices?${s}` : "/invoices";
}

function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function istYesterday(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Type + day + sort controls for the Sale Book. Links, not buttons, so the
 * view lives in the URL: it survives refresh and a filtered day can be
 * bookmarked or sent to someone. Same pill language as the product list.
 */
export function InvoiceSortBar({
  q,
  type,
  day,
  sort,
}: {
  q: string;
  type: SaleListBillType;
  day: string;
  sort: SaleListSort;
}) {
  const today = istToday();
  const yesterday = istYesterday();
  const pill = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors ${
      active
        ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Type
        </span>
        {TYPES.map((t) => (
          <Link
            key={t.key}
            href={href({ q, type: t.key, day, sort })}
            className={pill(t.key === type)}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Day
        </span>
        <Link href={href({ q, type, day: today, sort })} className={pill(day === today)}>
          Today
        </Link>
        <Link
          href={href({ q, type, day: yesterday, sort })}
          className={pill(day === yesterday)}
        >
          Yesterday
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Sort by
        </span>
        {SORTS.map((s) => {
          const active = s.key === sort;
          const Arrow = s.dir === "asc" ? ArrowUp : ArrowDown;
          return (
            <Link
              key={s.key}
              href={href({ q, type, day, sort: s.key })}
              className={pill(active)}
              title={active ? "Current order" : `Sort by ${s.label.toLowerCase()}`}
            >
              {s.label}
              {active && <Arrow className="h-3.5 w-3.5" />}
            </Link>
          );
        })}
      </div>

      {(q || type !== "all" || day || sort !== "newest") && (
        <Button asChild size="sm" variant="ghost">
          <Link href="/invoices">Clear all</Link>
        </Button>
      )}
    </div>
  );
}
