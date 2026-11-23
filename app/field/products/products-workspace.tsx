"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Download, FolderTree, ImageOff, Package, Pencil, Upload } from "lucide-react";
import { exportFieldProducts, fieldProductsPage, setFieldProductVisible } from "@/lib/actions/field";
import { PRODUCT_SHEET_COLUMNS } from "@/lib/field-product-sheet";
import { downloadExcel, todayStamp } from "@/components/field/excel";
import { ProductImportDialog } from "./product-import";
import { formatGst, formatInr, formatQty } from "@/lib/field-product-rules";
import { Badge, EmptyState, Notice, PageHeader, SearchBox, StatCard, StatGrid, Switch, buttonClass, inputClass } from "@/components/field/kit";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

type ProductRow = {
  productId: number;
  name: string;
  sku: string | null;
  appVisible: boolean;
  brand: string | null;
  description: string | null;
  mrp: string | null;
  gstRate: string;
  hsnCode: string | null;
  stock: number;
  minOrderQty: string | null;
  maxOrderQty: string | null;
  instructions: string | null;
  usageLines: string[];
  crops: string[];
  image: string | null;
  category: string;
  categorySlug: string;
  sub: string;
  gaps: string[];
  updatedAt: string | null;
};

type PageData = {
  stats: { total: number; complete: number; needsDetails: number; mapped: number; hidden: number };
  categories: Array<{ slug: string; title: string }>;
  rows: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
};

type Status = "all" | "needs" | "complete";
type Visible = "all" | "on" | "off";

export function ProductsWorkspace({ initial }: { initial: PageData }) {
  const t = useFieldText();
  const p = t.products;
  const locale = fieldLocale(useFieldLang());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [visible, setVisible] = useState<Visible>("all");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [switching, setSwitching] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
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

  const load = useCallback(
    async (next: { q: string; category: string; status: Status; visible: Visible; page: number }) => {
      const token = ++request.current;
      setLoading(true);
      setError("");
      try {
        const result = await fieldProductsPage({ q: next.q.trim(), category: next.category, status: next.status, visible: next.visible, page: next.page });
        if (token !== request.current) return;
        setRows(result.rows);
        setTotal(result.total);
        setPage(result.page);
        setPageSize(result.pageSize);
        setStats(result.stats);
      } catch (err) {
        if (token !== request.current) return;
        setError(err instanceof Error ? err.message : p.loadFailed);
      } finally {
        if (token === request.current) setLoading(false);
      }
    },
    [p.loadFailed]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => void load({ q: query, category, status, visible, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [query, load, category, status, visible]);

  const reload = () => void load({ q: query, category, status, visible, page });

  async function toggleVisible(row: ProductRow, next: boolean) {
    setSwitching(row.productId);
    setError("");
    setNotice("");
    // Show the change at once; put it back if saving fails.
    setRows((list) => list.map((r) => (r.productId === row.productId ? { ...r, appVisible: next } : r)));
    try {
      await setFieldProductVisible(row.productId, next);
      setStats((s) => ({ ...s, hidden: Math.max(0, s.hidden + (next ? -1 : 1)) }));
      setNotice(fmt(next ? p.shownInApp : p.hiddenInApp, { name: row.name }));
      if (visible !== "all") {
        // It no longer matches the In app filter, so it leaves this list.
        setRows((list) => list.filter((r) => r.productId !== row.productId));
        setTotal((n) => Math.max(0, n - 1));
      }
    } catch (err) {
      setRows((list) => list.map((r) => (r.productId === row.productId ? { ...r, appVisible: !next } : r)));
      setError(err instanceof Error ? err.message : p.switchFailed);
    } finally {
      setSwitching(null);
    }
  }

  async function exportAll() {
    setExporting(true);
    setError("");
    try {
      const all = await exportFieldProducts();
      await downloadExcel(`skywin-field-products-${todayStamp()}`, "Products", all, PRODUCT_SHEET_COLUMNS);
    } catch (err) {
      setError(err instanceof Error ? err.message : p.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const filtering = query.trim() || category || status !== "all" || visible !== "all";
  const gapLabel = (gap: string) => (gap === "description" ? p.gapDescription : gap === "ingredient or usage" ? p.gapUsage : gap);
  const savedOn = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "";

  const tabs: Array<{ key: Status; label: string; count: number }> = [
    { key: "all", label: p.filterAll, count: stats.total },
    { key: "needs", label: p.filterNeeds, count: stats.needsDetails },
    { key: "complete", label: p.filterComplete, count: stats.complete },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={p.title}
        description={p.subtitle}
        actions={
          <>
            <button type="button" onClick={() => setImporting(true)} className={buttonClass("secondary", "sm")}>
              <Upload aria-hidden /> {p.importButton}
            </button>
            <button type="button" onClick={() => void exportAll()} disabled={exporting} className={buttonClass("secondary", "sm")}>
              <Download aria-hidden /> {exporting ? p.exporting : p.exportButton}
            </button>
          </>
        }
      />
      {importing ? <ProductImportDialog onClose={() => setImporting(false)} onDone={reload} /> : null}

      <StatGrid>
        <StatCard icon={<Package />} label={p.statActive} value={stats.total.toLocaleString("en-IN")} sub={p.statActiveSub} />
        <StatCard icon={<CheckCircle2 />} label={p.statComplete} value={stats.complete.toLocaleString("en-IN")} sub={p.statCompleteSub} />
        <StatCard dark icon={<CircleAlert />} label={p.statNeeds} value={stats.needsDetails.toLocaleString("en-IN")} sub={p.statNeedsSub} />
        <StatCard icon={<FolderTree />} label={p.statMapped} value={stats.mapped.toLocaleString("en-IN")} sub={p.statMappedSub} />
      </StatGrid>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder={p.searchPh} label={p.searchPh} className="md:max-w-md" />
          <label className="sr-only" htmlFor="product-category">
            {p.allCategories}
          </label>
          <select id="product-category" value={category} onChange={(e) => setCategory(e.target.value)} className={cn(inputClass, "h-11 md:w-60")}>
            <option value="">{p.allCategories}</option>
            <option value="unassigned">{p.notInCatalogue}</option>
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.title}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="product-visible">
            {p.inApp}
          </label>
          <select id="product-visible" value={visible} onChange={(e) => setVisible(e.target.value as Visible)} className={cn(inputClass, "h-11 md:w-48")}>
            <option value="all">{p.visibleAll}</option>
            <option value="on">{p.visibleOn}</option>
            <option value="off">{fmt(p.visibleOff, { n: stats.hidden.toLocaleString("en-IN") })}</option>
          </select>
          {loading ? (
            <span role="status" aria-label={t.common.loading} className="h-4 w-4 animate-spin rounded-full border-2 border-[#1E3317]/20 border-t-[#3E5E2F]" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={status === tab.key}
              onClick={() => setStatus(tab.key)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                status === tab.key ? "bg-[#1E3317] text-white" : "border border-[#1E3317]/10 bg-white text-[#3E5E2F] hover:border-[#1E3317]/25"
              )}
            >
              {tab.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", status === tab.key ? "bg-[#C6E26A] text-[#1E3317]" : "bg-[#EDF2E7]")}>
                {tab.count.toLocaleString("en-IN")}
              </span>
            </button>
          ))}
          <span className="ml-auto text-xs tabular-nums text-[#5E6B62]">
            {total === 0 ? "" : fmt(p.shown, { from: from.toLocaleString("en-IN"), to: to.toLocaleString("en-IN"), total: total.toLocaleString("en-IN") })}
          </span>
        </div>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <Notice tone="red">{error}</Notice>
          <button type="button" onClick={reload} className={buttonClass("secondary", "sm")}>
            {p.retry}
          </button>
        </div>
      ) : null}
      {notice && !error ? <Notice tone="green">{notice}</Notice> : null}

      <div className={cn("overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm transition-opacity", loading && "opacity-60")} aria-busy={loading}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title={filtering ? p.emptyFiltered : p.emptyAll}
            body={
              query.trim()
                ? p.emptyQuery
                : status === "needs" && !category
                  ? p.emptyNeeds
                  : visible === "off"
                    ? p.emptyHidden
                    : category
                    ? p.emptyCategory
                    : status === "complete"
                      ? p.emptyComplete
                      : p.emptyDefault
            }
          />
        ) : (
          <ul>
            {rows.map((row) => {
              const saved = savedOn(row.updatedAt);
              const usage = [row.instructions, ...row.usageLines].filter(Boolean) as string[];
              return (
                <li key={row.productId} className="border-t border-[#1E3317]/8 first:border-t-0">
                  <div className="grid gap-4 p-4 sm:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[4.5rem_minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-start lg:p-5">
                    <div className="flex items-start gap-3 sm:block">
                      {row.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.image} alt="" loading="lazy" className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-xl border border-[#1E3317]/10 bg-white object-contain p-1" />
                      ) : (
                        <span aria-label={p.noPhoto} className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-xl border border-dashed border-[#1E3317]/15 bg-[#FAFBF7] text-[#5E6B62]">
                          <ImageOff className="h-5 w-5" />
                        </span>
                      )}
                      <div className="min-w-0 sm:hidden">
                        <ProductTitle row={row} p={p} gapLabel={gapLabel} />
                      </div>
                    </div>

                    <div className="min-w-0 space-y-2">
                      <div className="hidden sm:block">
                        <ProductTitle row={row} p={p} gapLabel={gapLabel} />
                      </div>
                      {row.description ? <p className="line-clamp-2 text-sm leading-6 text-[#29332C]">{row.description}</p> : null}
                      {row.crops.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {row.crops.slice(0, 6).map((crop) => (
                            <span key={crop} className="rounded-full bg-[#EDF2E7] px-2.5 py-0.5 text-[11px] font-medium text-[#3E5E2F]">
                              {crop}
                            </span>
                          ))}
                          {row.crops.length > 6 ? <span className="text-[11px] text-[#5E6B62]">{fmt(p.more, { n: row.crops.length - 6 })}</span> : null}
                        </div>
                      ) : null}
                      {usage.length ? (
                        <p className="line-clamp-2 text-xs leading-5 text-[#5E6B62]" title={usage.join("\n")}>
                          <span className="font-semibold text-[#3E5E2F]">{p.usage}: </span>
                          {usage.join(" · ")}
                        </p>
                      ) : null}
                    </div>

                    <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs sm:col-start-2 lg:col-start-auto">
                      <Fact label="SKU">
                        {row.sku ? (
                          <button
                            type="button"
                            title={t.common.copy}
                            className="font-mono font-semibold text-[#1E3317] hover:text-[#245B3E]"
                            onClick={() =>
                              void navigator.clipboard?.writeText(row.sku || "").then(() => {
                                setCopied(row.productId);
                                window.setTimeout(() => setCopied((c) => (c === row.productId ? null : c)), 1200);
                              })
                            }
                          >
                            {copied === row.productId ? t.common.copied : row.sku}
                          </button>
                        ) : (
                          <span className="text-[#5E6B62]">ID {row.productId}</span>
                        )}
                      </Fact>
                      <Fact label={p.mrp}>{formatInr(row.mrp)}</Fact>
                      <Fact label={p.gst}>{formatGst(row.gstRate)}</Fact>
                      <Fact label={p.hsn}>
                        <span className="font-mono">{row.hsnCode || "—"}</span>
                      </Fact>
                      <Fact label={p.stock}>
                        <Badge tone={row.stock > 5 ? "green" : row.stock > 0 ? "amber" : "red"}>{formatQty(row.stock)}</Badge>
                      </Fact>
                      <Fact label={p.orderLimits}>
                        {row.minOrderQty || row.maxOrderQty ? `${formatQty(row.minOrderQty)}–${formatQty(row.maxOrderQty)}` : "—"}
                      </Fact>
                      {row.brand ? <Fact label={p.brand}>{row.brand}</Fact> : null}
                    </dl>

                    <div className="flex flex-wrap items-center justify-between gap-3 sm:col-start-2 lg:col-start-auto lg:flex-col lg:items-end">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xs font-semibold", row.appVisible ? "text-[#245B3E]" : "text-[#8E3B34]")}>
                          {row.appVisible ? p.inAppOn : p.inAppOff}
                        </span>
                        <Switch
                          checked={row.appVisible}
                          disabled={switching === row.productId}
                          label={fmt(p.inAppSwitch, { name: row.name })}
                          onChange={(next) => void toggleVisible(row, next)}
                        />
                      </div>
                      <a href={`/field/products/${row.productId}`} className={buttonClass("secondary", "sm")}>
                        <Pencil aria-hidden /> {p.editDetails}
                      </a>
                      {saved ? <span className="text-[11px] text-[#5E6B62]">{fmt(t.common.updated, { date: saved })}</span> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1E3317]/8 bg-[#FAFBF7] px-4 py-3 text-xs text-[#5E6B62]">
            <span>{fmt(t.common.page, { n: page.toLocaleString("en-IN"), total: pages.toLocaleString("en-IN") })}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || loading} onClick={() => void load({ q: query, category, status, visible, page: page - 1 })} className={buttonClass("secondary", "sm")}>
                {t.common.previous}
              </button>
              <button type="button" disabled={page >= pages || loading} onClick={() => void load({ q: query, category, status, visible, page: page + 1 })} className={buttonClass("secondary", "sm")}>
                {t.common.next}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProductTitle({
  row,
  p,
  gapLabel,
}: {
  row: ProductRow;
  p: ReturnType<typeof useFieldText>["products"];
  gapLabel: (gap: string) => string;
}) {
  return (
    <div className="min-w-0">
      <p className="break-words text-[15px] font-bold leading-6 text-[#1E3317]">{row.name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {row.gaps.length === 0 ? (
          <Badge tone="green">{p.complete}</Badge>
        ) : (
          <Badge tone="amber">{fmt(p.needs, { gaps: row.gaps.map(gapLabel).join(", ") })}</Badge>
        )}
        {row.categorySlug === "unassigned" ? (
          <Link href="/field/catalog" className="text-xs font-semibold text-[#8A5A00] hover:underline">
            {p.notInCatalogue}
          </Link>
        ) : (
          <Link href={`/field/catalog/${row.categorySlug}`} className="text-xs text-[#5E6B62] hover:underline">
            {row.category}
            {row.sub !== "—" ? ` › ${row.sub}` : ""}
          </Link>
        )}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#5E6B62]">{label}</dt>
      <dd className="mt-0.5 truncate font-medium tabular-nums text-[#1E3317]">{children}</dd>
    </div>
  );
}
