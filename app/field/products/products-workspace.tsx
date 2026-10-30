"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fieldProductsPage } from "@/lib/actions/field";

type ProductRow = {
  productId: number;
  name: string;
  sku: string | null;
  stock: number;
  image: string | null;
  category: string;
  categorySlug: string;
  sub: string;
  gaps: string[];
  updatedAt: string | null;
};

type PageData = {
  stats: { total: number; complete: number; needsDetails: number; mapped: number };
  categories: Array<{ slug: string; title: string }>;
  rows: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
};

function savedOn(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProductsWorkspace({ initial }: { initial: PageData }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"all" | "needs" | "complete">("all");
  const [page, setPage] = useState(initial.page);
  const [rows, setRows] = useState(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [stats, setStats] = useState(initial.stats);
  const [categories] = useState(initial.categories);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const request = useRef(0);
  const first = useRef(true);

  const load = useCallback(async (next: { q: string; category: string; status: "all" | "needs" | "complete"; page: number }) => {
    const token = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await fieldProductsPage({
        q: next.q.trim(),
        category: next.category,
        status: next.status,
        page: next.page,
      });
      if (token !== request.current) return;
      setRows(result.rows);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
      setStats(result.stats);
    } catch (err) {
      if (token !== request.current) return;
      setError(err instanceof Error ? err.message : "Could not load products");
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void load({ q: query, category, status, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, load, category, status]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const filtering = query.trim() || category || status !== "all";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#1E3317]">Product details</h1>
        <p className="mt-1 text-sm text-[#5E6B62]">Manage the product information displayed in SkyWin Field.</p>
      </div>

      <section aria-label="Inventory summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active products", value: stats.total, hint: "Field list, live inventory stock" },
          { label: "Complete details", value: stats.complete, hint: "Description plus ingredient or usage" },
          { label: "Needs details", value: stats.needsDetails, hint: "Missing that farmer-facing writeup" },
          { label: "In catalog", value: stats.mapped, hint: "Pinned to a subcategory" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-[#1E3317]/10 bg-white px-4 py-3">
            <p className="text-xs font-medium text-[#5E6B62]">{item.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#1E3317]">
              {item.value.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-[#5E6B62]">{item.hint}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <label className="sr-only" htmlFor="product-search">
            Search products
          </label>
          <input
            id="product-search"
            role="searchbox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder="Search name or SKU"
            className="h-9 w-full rounded-md border border-[#1E3317]/15 bg-white px-3 pr-16 text-sm text-[#29332C] outline-none focus:ring-2 focus:ring-[#1E3317]"
          />
          <span className="absolute inset-y-0 right-1 flex items-center gap-1">
            {loading ? (
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1E3317]/20 border-t-[#C6E26A]"
                role="status"
                aria-label="Searching"
              />
            ) : null}
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#5E6B62] hover:bg-[#F4F3EE]"
              >
                ×
              </button>
            ) : null}
          </span>
        </div>
        <label className="sr-only" htmlFor="product-category">
          Catalog
        </label>
        <select
          id="product-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="h-9 rounded-md border border-[#1E3317]/15 bg-white px-3 text-sm text-[#29332C]"
        >
          <option value="">All catalog categories</option>
          <option value="unassigned">Not in catalogue</option>
          {categories.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.title}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="product-status">
          Details status
        </label>
        <select
          id="product-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | "needs" | "complete")}
          className="h-9 rounded-md border border-[#1E3317]/15 bg-white px-3 text-sm text-[#29332C]"
        >
          <option value="all">All detail states</option>
          <option value="needs">Needs details</option>
          <option value="complete">Complete</option>
        </select>
        <p className="text-xs tabular-nums text-[#5E6B62] lg:ml-auto">
          {total === 0 ? "0 shown" : `${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`}
        </p>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-[#8E3B34]/30 bg-white px-3 py-2">
          <p className="text-sm text-[#8E3B34]">{error}</p>
          <button
            type="button"
            onClick={() => void load({ q: query, category, status, page })}
            className="text-sm font-medium text-[#245B3E] hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-[#1E3317]/10 bg-white" aria-busy={loading}>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-[#1E3317]">
              {filtering ? "No products match" : "No active products"}
            </p>
            <p className="mt-1 text-sm text-[#5E6B62]">
              {query.trim()
                ? "Try another name or SKU."
                : status === "needs" && !category
                  ? "Every active product already has a description and crop information."
                  : category
                    ? "No active products are in this catalog category."
                    : status === "complete"
                      ? "No product has a description and crop information yet."
                      : "Products from the field list appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-[#1E3317]/10 text-left text-xs text-[#5E6B62]">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Catalog</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId} className="border-t border-[#1E3317]/10 hover:bg-[#F7F6F1]">
                    <td className="max-w-[22rem] px-3 py-2.5">
                      <div className="flex items-start gap-3">
                        {row.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.image}
                            alt=""
                            loading="lazy"
                            className="h-10 w-10 shrink-0 rounded-md border border-[#1E3317]/10 bg-white object-contain"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#1E3317]/10 bg-[#EEF1E6] text-[#5E6B62]"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                              <path d="M4 7.5h16v11H4z" />
                              <path d="M8 7.5 9.2 5h5.6L16 7.5" />
                            </svg>
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium break-words text-[#1E3317]">{row.name}</p>
                          <p className="mt-0.5 flex items-center gap-2 text-xs text-[#5E6B62]">
                            <span className="truncate">{row.sku || `ID ${row.productId}`}</span>
                            {row.sku ? (
                              <button
                                type="button"
                                className="shrink-0 font-medium text-[#245B3E] hover:underline"
                                onClick={() => {
                                  void navigator.clipboard.writeText(row.sku || "").then(() => {
                                    setCopied(row.productId);
                                    window.setTimeout(() => setCopied((current) => (current === row.productId ? null : current)), 1200);
                                  });
                                }}
                              >
                                {copied === row.productId ? "Copied" : "Copy"}
                              </button>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[#1E3317]">
                      {row.stock.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="max-w-[14rem] px-3 py-2.5">
                      {row.categorySlug === "unassigned" ? (
                        <Link href="/field/catalog" className="font-medium text-[#245B3E] hover:underline">
                          Not in catalogue
                        </Link>
                      ) : (
                        <Link href={`/field/catalog/${row.categorySlug}`} className="break-words font-medium text-[#1E3317] hover:underline">
                          {row.category}
                        </Link>
                      )}
                      <p className="mt-0.5 break-words text-xs text-[#5E6B62]">{row.sub === "—" ? "No subcategory" : row.sub}</p>
                    </td>
                    <td className="max-w-[16rem] px-3 py-2.5">
                      {row.gaps.length === 0 ? (
                        <span className="text-[#245B3E]">
                          Complete
                          {row.image ? null : <span className="mt-0.5 block text-xs text-[#5E6B62]">No photo</span>}
                        </span>
                      ) : (
                        <span className="text-[#29332C]">
                          Needs details
                          <span className="mt-0.5 block text-xs text-[#5E6B62]">{row.gaps.join(", ")}</span>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[#5E6B62]">{savedOn(row.updatedAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/field/products/${row.productId}`} className="text-xs font-medium text-[#245B3E] hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => void load({ q: query, category, status, page: page - 1 })}
            className="h-8 rounded-md border border-[#1E3317]/15 bg-white px-3 text-xs font-medium disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-[#5E6B62]">
            Page {page.toLocaleString("en-IN")} of {pages.toLocaleString("en-IN")}
          </span>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => void load({ q: query, category, status, page: page + 1 })}
            className="h-8 rounded-md border border-[#1E3317]/15 bg-white px-3 text-xs font-medium disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
