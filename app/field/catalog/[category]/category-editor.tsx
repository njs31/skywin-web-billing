"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FieldCatalogProduct, FieldCatalogTreeCategory } from "@/lib/queries/field-catalog";
import {
  createBillingProductForSub,
  pinProductToSub,
  removeFieldCategory,
  removeFieldSubcategory,
  saveFieldCategory,
  saveFieldSubcategory,
  searchBillingProducts,
  unpinProductFromSub,
} from "@/lib/actions/field";
import { cn, formatCurrency } from "@/lib/utils";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Notice, PageHeader, buttonClass, inputClass, labelClass, tableClass, tdClass, thClass, theadClass, trClass } from "@/components/field/kit";
import { useFieldText } from "@/components/field/lang";
import { fmt, plural } from "@/lib/field-i18n";

type SearchHit = {
  productId: number;
  name: string;
  sku: string | null;
  productStockQty: string;
  saleRate: string;
};

const fieldClass = inputClass;
const Label = ({ htmlFor, children, className }: { htmlFor?: string; children: React.ReactNode; className?: string }) => (
  <label htmlFor={htmlFor} className={className === "sr-only" ? "sr-only" : labelClass}>
    {children}
  </label>
);

export function CategoryEditor({
  category,
  productSets,
}: {
  category: FieldCatalogTreeCategory;
  productSets: Array<{ subcategoryId: number; products: FieldCatalogProduct[] }>;
}) {
  const router = useRouter();
  const t = useFieldText();
  const c = t.catalog;
  const [pending, start] = useTransition();
  const [subId, setSubId] = useState(category.subs[0]?.id ?? 0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [editingCategory, setEditingCategory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveSub, setConfirmRemoveSub] = useState(false);
  const [catTitle, setCatTitle] = useState(category.title);
  const [catQueries, setCatQueries] = useState(category.queries.join(", "));
  const [catTitleError, setCatTitleError] = useState("");
  const [addingSub, setAddingSub] = useState(category.subs.length === 0);
  const [subTitle, setSubTitle] = useState("");
  const [subQueries, setSubQueries] = useState("");
  const [subMatch, setSubMatch] = useState("");
  const [subTitleError, setSubTitleError] = useState("");
  const [editingSub, setEditingSub] = useState(false);
  const [editSubTitle, setEditSubTitle] = useState("");
  const [editSubQueries, setEditSubQueries] = useState("");
  const [editSubMatch, setEditSubMatch] = useState("");
  const [editSubError, setEditSubError] = useState("");
  const [creatingSku, setCreatingSku] = useState(false);
  const [unpinId, setUnpinId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newRate, setNewRate] = useState("");
  const [newGst, setNewGst] = useState("18");
  const [newHsn, setNewHsn] = useState("");
  const [skuErrors, setSkuErrors] = useState<{ name?: string; rate?: string; hsn?: string; gst?: string }>({});

  const productsBySub = useMemo(() => {
    const map = new Map<number, FieldCatalogProduct[]>();
    for (const set of productSets) map.set(set.subcategoryId, set.products);
    return map;
  }, [productSets]);

  const active = category.subs.find((sub) => sub.id === subId) ?? category.subs[0];
  const products = active ? productsBySub.get(active.id) ?? [] : [];
  const needle = productFilter.trim().toLowerCase();
  const visibleProducts = products.filter(
    (product) =>
      !needle ||
      product.name.toLowerCase().includes(needle) ||
      (product.sku ?? "").toLowerCase().includes(needle)
  );
  const skuTotal = category.subs.reduce((sum, sub) => sum + sub.productIds.length, 0);

  function run(fn: () => Promise<void>, saved?: string) {
    setError("");
    setNotice("");
    start(async () => {
      try {
        await fn();
        if (saved) setNotice(saved);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.common.somethingWrong);
      }
    });
  }

  function searchProducts() {
    if (!q.trim()) {
      setError(c.enterSearch);
      return;
    }
    run(async () => {
      const rows = await searchBillingProducts(q);
      setHits(
        rows.map((row) => ({
          productId: row.productId,
          name: row.name,
          sku: row.sku,
          productStockQty: row.productStockQty,
          saleRate: row.saleRate,
        }))
      );
    });
  }

  function validateSku() {
    const next: { name?: string; rate?: string; hsn?: string; gst?: string } = {};
    if (!newName.trim()) next.name = c.nameRequired;
    const rate = Number(newRate);
    if (!newRate.trim() || !Number.isFinite(rate) || rate < 0) next.rate = c.rateInvalid;
    if (!newHsn.trim()) next.hsn = c.hsnRequired;
    const gst = Number(newGst);
    if (newGst.trim() && (!Number.isFinite(gst) || gst < 0)) next.gst = c.gstInvalid;
    setSkuErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        back={{ href: "/field/catalog", label: c.backToCatalog }}
        title={category.title}
        description={`${plural(category.subs.length, c.subcategory, c.subcategories)} · ${plural(skuTotal, c.product, c.products)} · /${category.slug}`}
        actions={
          <>
            <button type="button" className={buttonClass("secondary")} onClick={() => setEditingCategory((value) => !value)}>
              <Pencil aria-hidden /> {editingCategory ? c.closeEdit : c.editCategory}
            </button>
            <button type="button" className={buttonClass("danger")} disabled={pending} onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden /> {c.deleteCategory}
            </button>
          </>
        }
      />

      {error ? <Notice tone="red">{error}</Notice> : null}
      {notice && !error ? <Notice>{notice}</Notice> : null}

      {confirmDelete ? (
        <div className="rounded-2xl border border-[#8E3B34]/25 bg-[#FFF8F7] px-5 py-4" role="alert">
          <p className="text-sm font-medium text-[#1E3317]">{fmt(c.deleteConfirm, { name: category.title })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass("danger")}
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await removeFieldCategory(category.id);
                  router.push("/field/catalog");
                })
              }
            >
              {pending ? t.common.deleting : c.deleteCategory}
            </button>
            <button type="button" className={buttonClass("secondary")} disabled={pending} onClick={() => setConfirmDelete(false)}>
              {t.common.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {editingCategory ? (
        <form
          className="rounded-2xl border border-[#1E3317]/10 bg-white p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!catTitle.trim()) {
              setCatTitleError(c.titleRequired);
              return;
            }
            setCatTitleError("");
            run(
              () => saveFieldCategory({ id: category.id, title: catTitle, queries: catQueries }),
              c.savedCategory
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="category-title">
                {c.fieldTitle} <span className="text-[#8E3B34]">*</span>
              </Label>
              <input
                id="category-title"
                value={catTitle}
                onChange={(event) => {
                  setCatTitle(event.target.value);
                  if (catTitleError) setCatTitleError("");
                }}
                aria-invalid={catTitleError ? true : undefined}
                aria-describedby={catTitleError ? "category-title-error" : undefined}
                className={fieldClass}
              />
              {catTitleError ? (
                <p id="category-title-error" className="mt-1 text-xs text-[#8E3B34]">
                  {catTitleError}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="category-queries">{c.fieldQueries}</Label>
              <input
                id="category-queries"
                value={catQueries}
                onChange={(event) => setCatQueries(event.target.value)}
                aria-describedby="category-queries-help"
                className={fieldClass}
              />
              <p id="category-queries-help" className="mt-1 text-xs text-[#5E6B62]">
                {fmt(c.slugStays, { slug: category.slug })}
              </p>
            </div>
          </div>
          <button type="submit" disabled={pending} className={cn("mt-4", buttonClass(notice === c.savedCategory && !pending ? "lime" : "primary"))}>
            {pending ? t.common.saving : notice === c.savedCategory ? t.common.saved : c.saveCategory}
          </button>
        </form>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2 border-b border-[#1E3317]/8 px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#5E6B62]">{c.subcats}</h2>
            <button type="button" onClick={() => setAddingSub((value) => !value)} className={buttonClass("ghost", "sm")}>
              {addingSub ? t.common.close : (
                <>
                  <Plus aria-hidden /> {c.addSub}
                </>
              )}
            </button>
          </div>
          {category.subs.length === 0 ? (
            <p className="px-4 py-4 text-xs leading-5 text-[#5E6B62]">{c.noSubs}</p>
          ) : (
            <div className="flex gap-1 overflow-x-auto p-2 lg:flex-col">
              {category.subs.map((sub) => {
                const on = sub.id === active?.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSubId(sub.id);
                      setProductFilter("");
                      setHits(null);
                      setConfirmRemoveSub(false);
                      setEditingSub(false);
                      setUnpinId(null);
                    }}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex min-w-36 shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors lg:min-w-0 lg:w-full",
                      on
                        ? "bg-[#1E3317] font-semibold text-white"
                        : "text-[#29332C] hover:bg-[#F4F8EF]"
                    )}
                  >
                    <span className="truncate">{sub.title}</span>
                    <span className={cn("rounded-full px-2 text-xs tabular-nums", on ? "bg-[#C6E26A] text-[#1E3317]" : "bg-[#EDF2E7] text-[#3E5E2F]")}>
                      {sub.productIds.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {addingSub ? (
            <form
              className="space-y-3 border-t border-[#1E3317]/8 bg-[#FAFBF7] p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!subTitle.trim()) {
                  setSubTitleError(c.titleRequired);
                  return;
                }
                setSubTitleError("");
                run(async () => {
                  await saveFieldSubcategory({
                    categoryId: category.id,
                    title: subTitle,
                    queries: subQueries,
                    matchTerms: subMatch,
                  });
                  setSubTitle("");
                  setSubQueries("");
                  setSubMatch("");
                  setAddingSub(false);
                }, c.addedSub);
              }}
            >
              <p className="text-sm font-bold text-[#1E3317]">{c.addSubTitle}</p>
              <Label htmlFor="sub-title">
                {c.fieldTitle} <span className="text-[#8E3B34]">*</span>
              </Label>
              <input
                id="sub-title"
                value={subTitle}
                onChange={(event) => {
                  setSubTitle(event.target.value);
                  if (subTitleError) setSubTitleError("");
                }}
                aria-invalid={subTitleError ? true : undefined}
                aria-describedby={subTitleError ? "sub-title-error" : "sub-title-help"}
                className={fieldClass}
              />
              {subTitleError ? (
                <p id="sub-title-error" className="text-xs text-[#8E3B34]">
                  {subTitleError}
                </p>
              ) : (
                <p id="sub-title-help" className="text-xs text-[#5E6B62]">
                  {c.addHelp.split(".")[0]}.
                </p>
              )}
              <Label htmlFor="sub-queries">{c.fieldQueries}</Label>
              <input
                id="sub-queries"
                value={subQueries}
                onChange={(event) => setSubQueries(event.target.value)}
                aria-describedby="sub-queries-help"
                className={fieldClass}
              />
              <p id="sub-queries-help" className="text-xs text-[#5E6B62]">
                {c.queriesHelp}
              </p>
              <Label htmlFor="sub-match">{c.matchTerms}</Label>
              <input
                id="sub-match"
                value={subMatch}
                onChange={(event) => setSubMatch(event.target.value)}
                aria-describedby="sub-match-help"
                className={fieldClass}
              />
              <p id="sub-match-help" className="text-xs text-[#5E6B62]">
                {c.matchHelp}
              </p>
              <button type="submit" disabled={pending} className={cn("w-full", buttonClass(notice === c.addedSub && !pending ? "lime" : "primary"))}>
                {pending ? t.common.saving : notice === c.addedSub ? t.common.saved : c.addSubButton}
              </button>
            </form>
          ) : null}
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm">
          {active ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E3317]/8 px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-[#1E3317]">{active.title}</h2>
                  <p className="text-xs text-[#5E6B62]">{plural(products.length, c.product, c.products)}</p>
                </div>
                {confirmRemoveSub ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#8E3B34]">{c.removeSubConfirm}</span>
                    <button
                      type="button"
                      className={buttonClass("danger", "sm")}
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await removeFieldSubcategory(active.id);
                          setSubId(category.subs.find((sub) => sub.id !== active.id)?.id ?? 0);
                          setConfirmRemoveSub(false);
                        })
                      }
                    >
                      {c.removeSub}
                    </button>
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setConfirmRemoveSub(false)}>
                      {t.common.cancel}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={buttonClass("secondary", "sm")}
                      onClick={() => {
                        setEditSubTitle(active.title);
                        setEditSubQueries(active.queries.join(", "));
                        setEditSubMatch(active.matchTerms.join(", "));
                        setEditSubError("");
                        setEditingSub((value) => !value);
                      }}
                    >
                      <Pencil aria-hidden /> {editingSub ? t.common.close : c.editSub}
                    </button>
                    <button type="button" className={buttonClass("danger", "sm")} disabled={pending} onClick={() => setConfirmRemoveSub(true)}>
                      <Trash2 aria-hidden /> {c.removeSub}
                    </button>
                  </div>
                )}
              </div>

              {editingSub ? (
                <form
                  className="grid gap-4 border-b border-[#1E3317]/8 bg-[#FAFBF7] px-5 py-4 sm:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editSubTitle.trim()) {
                      setEditSubError(c.titleRequired);
                      return;
                    }
                    setEditSubError("");
                    run(
                      () =>
                        saveFieldSubcategory({
                          id: active.id,
                          categoryId: category.id,
                          title: editSubTitle,
                          queries: editSubQueries,
                          matchTerms: editSubMatch,
                        }),
                      c.savedSub
                    );
                  }}
                >
                  <div>
                    <Label htmlFor="edit-sub-title">
                      {c.fieldTitle} <span className="text-[#8E3B34]">*</span>
                    </Label>
                    <input
                      id="edit-sub-title"
                      value={editSubTitle}
                      onChange={(event) => {
                        setEditSubTitle(event.target.value);
                        if (editSubError) setEditSubError("");
                      }}
                      aria-invalid={editSubError ? true : undefined}
                      aria-describedby={editSubError ? "edit-sub-title-error" : undefined}
                      className={fieldClass}
                    />
                    {editSubError ? (
                      <p id="edit-sub-title-error" className="mt-1 text-xs text-[#8E3B34]">
                        {editSubError}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="edit-sub-queries">{c.fieldQueries}</Label>
                    <input
                      id="edit-sub-queries"
                      value={editSubQueries}
                      onChange={(event) => setEditSubQueries(event.target.value)}
                      aria-describedby="edit-sub-queries-help"
                      className={fieldClass}
                    />
                    <p id="edit-sub-queries-help" className="mt-1 text-xs text-[#5E6B62]">
                      {fmt(c.slugStays, { slug: active.slug })}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="edit-sub-match">{c.matchTerms}</Label>
                    <input
                      id="edit-sub-match"
                      value={editSubMatch}
                      onChange={(event) => setEditSubMatch(event.target.value)}
                      aria-describedby="edit-sub-match-help"
                      className={fieldClass}
                    />
                    <p id="edit-sub-match-help" className="mt-1 text-xs text-[#5E6B62]">
                      {c.matchHelp}
                    </p>
                    <button type="submit" disabled={pending} className={cn("mt-3", buttonClass(notice === c.savedSub && !pending ? "lime" : "primary", "sm"))}>
                      {pending ? t.common.saving : notice === c.savedSub ? t.common.saved : c.saveSub}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="border-b border-[#1E3317]/8 px-5 py-3">
                <label htmlFor="pinned-filter" className="sr-only">
                  {c.filterPinned}
                </label>
                <input
                  id="pinned-filter"
                  value={productFilter}
                  onChange={(event) => setProductFilter(event.target.value)}
                  placeholder={c.filterPinned}
                  className={cn(inputClass, "max-w-sm")}
                />
              </div>

              {visibleProducts.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-[#5E6B62]">{products.length === 0 ? c.noPinned : c.noPinnedMatch}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn(tableClass, "min-w-[560px]")}>
                    <thead className={theadClass}>
                      <tr>
                        <th className={thClass}>{c.colProduct}</th>
                        <th className={thClass}>SKU</th>
                        <th className={cn(thClass, "text-right")}>{c.colPrice}</th>
                        <th className={cn(thClass, "text-right")}>{c.colStock}</th>
                        <th className={cn(thClass, "text-right")}>{t.common.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => (
                        <tr key={product.id} className={trClass}>
                          <td className={cn(tdClass, "font-medium text-[#1E3317]")}>{product.name}</td>
                          <td className={cn(tdClass, "font-mono text-xs text-[#5E6B62]")}>{product.sku || `ID ${product.id}`}</td>
                          <td className={cn(tdClass, "text-right tabular-nums")}>{formatCurrency(product.saleRate)}</td>
                          <td className={cn(tdClass, "text-right")}>
                            <Badge tone={Number(product.stockQty) > 0 ? "green" : "red"}>{Number(product.stockQty) || 0}</Badge>
                          </td>
                          <td className={cn(tdClass, "whitespace-nowrap text-right")}>
                            <Link href={`/field/products/${product.id}`} className="text-xs font-semibold text-[#245B3E] hover:underline">
                              {t.common.view}
                            </Link>
                            {unpinId === product.id ? (
                              <span className="ml-3 inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() =>
                                    run(async () => {
                                      await unpinProductFromSub(active.id, product.id);
                                      setUnpinId(null);
                                    }, c.unpinnedNotice)
                                  }
                                  className="text-xs font-medium text-[#8E3B34] hover:underline disabled:opacity-50"
                                >
                                  {pending ? c.unpinning : t.common.confirm}
                                </button>
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => setUnpinId(null)}
                                  className="text-xs font-medium text-[#5E6B62] hover:underline disabled:opacity-50"
                                >
                                  {t.common.cancel}
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => setUnpinId(product.id)}
                                className="ml-3 text-xs font-medium text-[#8E3B34] hover:underline disabled:opacity-50"
                              >
                                {c.unpin}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-3 border-t border-[#1E3317]/8 bg-[#FAFBF7] px-5 py-5">
                <h3 className="text-sm font-bold text-[#1E3317]">{c.pinTitle}</h3>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder={c.pinSearchPh}
                    aria-label={c.pinSearchPh}
                    className={inputClass}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        searchProducts();
                      }
                    }}
                  />
                  <button type="button" disabled={pending} onClick={searchProducts} className={buttonClass("primary")}>
                    <Search aria-hidden /> {pending ? c.pinSearching : c.pinSearch}
                  </button>
                </div>
                {hits && hits.length === 0 ? (
                  <p className="text-sm text-[#5E6B62]">{c.noHits}</p>
                ) : null}
                {hits && hits.length > 0 ? (
                  <ul className="divide-y divide-[#1E3317]/8 overflow-hidden rounded-xl border border-[#1E3317]/10 bg-white">
                    {hits.map((hit) => (
                      <li key={hit.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{hit.name}</span>
                          <span className="text-xs text-[#5E6B62]">
                            {hit.sku || `ID ${hit.productId}`} · {formatCurrency(hit.saleRate)} · {fmt(c.stock, { n: Number(hit.productStockQty) || 0 })}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          className={buttonClass("primary", "sm")}
                          onClick={() => run(() => pinProductToSub(active.id, hit.productId), c.pinnedNotice)}
                        >
                          <Plus aria-hidden /> {c.pin}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <button
                  type="button"
                  onClick={() => setCreatingSku((value) => !value)}
                  className={buttonClass("ghost", "sm")}
                >
                  {creatingSku ? t.common.close : c.createSku}
                </button>
                {creatingSku ? (
                  <form
                    className="space-y-4 rounded-xl border border-[#1E3317]/10 bg-white p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!validateSku()) return;
                      run(async () => {
                        await createBillingProductForSub(active.id, {
                          name: newName.trim(),
                          sku: newSku.trim() || undefined,
                          saleRate: Number(newRate),
                          gstRate: newGst.trim() ? Number(newGst) : 18,
                          hsnCode: newHsn.trim(),
                        });
                        setNewName("");
                        setNewSku("");
                        setNewRate("");
                        setNewHsn("");
                        setSkuErrors({});
                      }, c.createdNotice);
                    }}
                  >
                    <div>
                      <p className="text-xs text-[#5E6B62]">{c.createSkuHelp}</p>
                      <Label htmlFor="sku-name">
                        {c.skuName} <span className="text-[#8E3B34]">*</span>
                      </Label>
                      <input
                        id="sku-name"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        aria-invalid={skuErrors.name ? true : undefined}
                        aria-describedby={skuErrors.name ? "sku-name-error" : undefined}
                        className={fieldClass}
                      />
                      {skuErrors.name ? (
                        <p id="sku-name-error" className="mt-1 text-xs text-[#8E3B34]">
                          {skuErrors.name}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="sku-code">{c.skuCode}</Label>
                        <input
                          id="sku-code"
                          value={newSku}
                          onChange={(event) => setNewSku(event.target.value)}
                          aria-describedby="sku-code-help"
                          className={fieldClass}
                        />
                        <p id="sku-code-help" className="mt-1 text-xs text-[#5E6B62]">
                          {t.common.optional}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="sku-rate">
                          {c.skuRate} <span className="text-[#8E3B34]">*</span>
                        </Label>
                        <input
                          id="sku-rate"
                          value={newRate}
                          inputMode="decimal"
                          onChange={(event) => setNewRate(event.target.value)}
                          aria-invalid={skuErrors.rate ? true : undefined}
                          aria-describedby={skuErrors.rate ? "sku-rate-error" : undefined}
                          className={fieldClass}
                        />
                        {skuErrors.rate ? (
                          <p id="sku-rate-error" className="mt-1 text-xs text-[#8E3B34]">
                            {skuErrors.rate}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <Label htmlFor="sku-gst">{c.skuGst}</Label>
                        <input
                          id="sku-gst"
                          value={newGst}
                          inputMode="decimal"
                          onChange={(event) => setNewGst(event.target.value)}
                          aria-invalid={skuErrors.gst ? true : undefined}
                          aria-describedby={skuErrors.gst ? "sku-gst-error" : "sku-gst-help"}
                          className={fieldClass}
                        />
                        {skuErrors.gst ? (
                          <p id="sku-gst-error" className="mt-1 text-xs text-[#8E3B34]">
                            {skuErrors.gst}
                          </p>
                        ) : (
                          <p id="sku-gst-help" className="mt-1 text-xs text-[#5E6B62]">
                            18%
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="sku-hsn">
                          {c.skuHsn} <span className="text-[#8E3B34]">*</span>
                        </Label>
                        <input
                          id="sku-hsn"
                          value={newHsn}
                          onChange={(event) => setNewHsn(event.target.value)}
                          aria-invalid={skuErrors.hsn ? true : undefined}
                          aria-describedby={skuErrors.hsn ? "sku-hsn-error" : undefined}
                          className={fieldClass}
                        />
                        {skuErrors.hsn ? (
                          <p id="sku-hsn-error" className="mt-1 text-xs text-[#8E3B34]">
                            {skuErrors.hsn}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <button type="submit" disabled={pending} className={buttonClass(notice === c.createdNotice && !pending ? "lime" : "primary")}>
                      {pending ? t.common.saving : notice === c.createdNotice ? t.common.saved : c.createAndPin}
                    </button>
                  </form>
                ) : null}
              </div>
            </>
          ) : (
            <p className="px-5 py-12 text-center text-sm text-[#5E6B62]">{c.noSubs}</p>
          )}
        </section>
      </div>

    </div>
  );
}
