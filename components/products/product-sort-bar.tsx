import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  DEFAULT_SORT_DIR,
  PRODUCT_SORTS,
  type ProductSort,
  type SortDir,
} from "@/lib/queries/products";

const LABELS: Record<ProductSort, string> = {
  name: "Name",
  recent: "Recently added",
  price: "Price",
  stock: "Stock",
  expiry: "Expiry",
};

/**
 * Sort controls for the product list.
 *
 * Links rather than buttons, so the sort lives in the URL: the list is paged
 * and sorted on the server, the choice survives a refresh, and a particular
 * view can be bookmarked or sent to someone.
 *
 * Clicking the active sort flips its direction — that is where "high to low"
 * lives, on every column rather than as one switch that has to be kept in step
 * with whichever sort happens to be selected.
 */
export function ProductSortBar({
  sort,
  dir,
  q,
}: {
  sort: ProductSort;
  dir: SortDir;
  q?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Sort by
      </span>
      {PRODUCT_SORTS.map((key) => {
        const active = key === sort;
        const nextDir: SortDir = active
          ? dir === "asc"
            ? "desc"
            : "asc"
          : DEFAULT_SORT_DIR[key];

        const params = new URLSearchParams();
        if (q) params.set("q", q);
        params.set("sort", key);
        params.set("dir", nextDir);
        // No page: a new order means the old page number means nothing.

        const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
        return (
          <Link
            key={key}
            href={`/products?${params.toString()}`}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            title={
              active
                ? `Sorted ${dir === "asc" ? "low to high" : "high to low"} — click to flip`
                : `Sort by ${LABELS[key].toLowerCase()}`
            }
          >
            {LABELS[key]}
            {active && <Arrow className="h-3.5 w-3.5" />}
          </Link>
        );
      })}
    </div>
  );
}
