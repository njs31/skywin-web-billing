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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SearchHit = {
  productId: number;
  name: string;
  sku: string | null;
  productStockQty: string;
  saleRate: string;
};

const fieldClass = "mt-1 h-9 rounded-md border-[#1E3317]/15 text-sm focus-visible:ring-[#1E3317]";
const primaryButton = "bg-[#1E3317] text-white hover:bg-[#245B3E]";

export function CategoryEditor({
  category,
  productSets,
}: {
  category: FieldCatalogTreeCategory;
  productSets: Array<{ subcategoryId: number; products: FieldCatalogProduct[] }>;
}) {
  const router = useRouter();
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
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function searchProducts() {
    if (!q.trim()) {
      setError("Enter a product name or SKU to search billing.");
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
    if (!newName.trim()) next.name = "Name is required.";
    const rate = Number(newRate);
    if (!newRate.trim() || !Number.isFinite(rate) || rate < 0) next.rate = "Enter a sale rate of zero or more.";
    if (!newHsn.trim()) next.hsn = "HSN code is mandatory.";
    const gst = Number(newGst);
    if (newGst.trim() && (!Number.isFinite(gst) || gst < 0)) next.gst = "GST must be zero or more.";
    setSkuErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <Link href="/field/catalog" className="text-xs font-medium text-[#245B3E] hover:underline">
          Catalog
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#1E3317]">{category.title}</h1>
            <p className="mt-1 text-sm text-[#5E6B62]">
              {category.subs.length} {category.subs.length === 1 ? "subcategory" : "subcategories"} · {skuTotal}{" "}
              {skuTotal === 1 ? "SKU" : "SKUs"} · {category.slug}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditingCategory((value) => !value)}>
              {editingCategory ? "Close category" : "Edit category"}
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => setConfirmDelete(true)}>
              Delete category
            </Button>
          </div>
        </div>
      </div>

      {confirmDelete ? (
        <div className="rounded-lg border border-[#8E3B34]/30 bg-white px-4 py-3" role="alert">
          <p className="text-sm text-[#1E3317]">
            Delete {category.title}? Its subcategories and product pins are removed. Billing products stay in inventory.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await removeFieldCategory(category.id);
                  router.push("/field/catalog");
                })
              }
            >
              {pending ? "Deleting…" : "Delete category"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {editingCategory ? (
        <form
          className="rounded-lg border border-[#1E3317]/10 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!catTitle.trim()) {
              setCatTitleError("Title is required.");
              return;
            }
            setCatTitleError("");
            run(
              () => saveFieldCategory({ id: category.id, title: catTitle, queries: catQueries }),
              "Category saved"
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="category-title">
                Title <span className="text-[#8E3B34]">*</span>
              </Label>
              <Input
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
              <Label htmlFor="category-queries">Search queries</Label>
              <Input
                id="category-queries"
                value={catQueries}
                onChange={(event) => setCatQueries(event.target.value)}
                aria-describedby="category-queries-help"
                className={fieldClass}
              />
              <p id="category-queries-help" className="mt-1 text-xs text-[#5E6B62]">
                Comma-separated words. The category slug stays {category.slug}.
              </p>
            </div>
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            className={cn("mt-3", notice === "Category saved" && !pending ? "bg-[#245B3E] hover:bg-[#245B3E]" : primaryButton)}
          >
            {pending ? "Saving…" : notice === "Category saved" ? "Saved" : "Save category"}
          </Button>
        </form>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="rounded-lg border border-[#1E3317]/10 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[#1E3317]/10 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#5E6B62]">Subcategories</h2>
            <button
              type="button"
              onClick={() => setAddingSub((value) => !value)}
              className="text-xs font-medium text-[#245B3E] hover:underline"
            >
              {addingSub ? "Close" : "Add"}
            </button>
          </div>
          {category.subs.length === 0 ? (
            <p className="px-3 py-4 text-xs leading-5 text-[#5E6B62]">
              This category has no subcategories yet. Add one to pin billing products.
            </p>
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
                      "flex min-w-36 shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm lg:min-w-0 lg:w-full",
                      on
                        ? "bg-[#F4F3EE] font-medium text-[#1E3317] shadow-[inset_3px_0_0_#C6E26A]"
                        : "text-[#29332C] hover:bg-[#F7F6F1]"
                    )}
                  >
                    <span className="truncate">{sub.title}</span>
                    <span className="tabular-nums text-xs text-[#5E6B62]">{sub.productIds.length}</span>
                  </button>
                );
              })}
            </div>
          )}
          {addingSub ? (
            <form
              className="space-y-2 border-t border-[#1E3317]/10 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!subTitle.trim()) {
                  setSubTitleError("Title is required.");
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
                }, "Subcategory added");
              }}
            >
              <Label htmlFor="sub-title">
                Title <span className="text-[#8E3B34]">*</span>
              </Label>
              <Input
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
                  Shown as a rail in the Field app.
                </p>
              )}
              <Label htmlFor="sub-queries">Search queries</Label>
              <Input
                id="sub-queries"
                value={subQueries}
                onChange={(event) => setSubQueries(event.target.value)}
                aria-describedby="sub-queries-help"
                className={fieldClass}
              />
              <p id="sub-queries-help" className="text-xs text-[#5E6B62]">
                Optional. Comma-separated.
              </p>
              <Label htmlFor="sub-match">Match terms</Label>
              <Input
                id="sub-match"
                value={subMatch}
                onChange={(event) => setSubMatch(event.target.value)}
                aria-describedby="sub-match-help"
                className={fieldClass}
              />
              <p id="sub-match-help" className="text-xs text-[#5E6B62]">
                Optional words used to match billing product names.
              </p>
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                className={notice === "Subcategory added" && !pending ? "bg-[#245B3E] hover:bg-[#245B3E]" : primaryButton}
              >
                {pending ? "Saving…" : notice === "Subcategory added" ? "Saved" : "Add subcategory"}
              </Button>
            </form>
          ) : null}
        </aside>

        <section className="min-w-0 rounded-lg border border-[#1E3317]/10 bg-white">
          {active ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E3317]/10 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#1E3317]">{active.title}</h2>
                  <p className="text-xs text-[#5E6B62]">
                    {products.length} pinned {products.length === 1 ? "product" : "products"}
                  </p>
                </div>
                {confirmRemoveSub ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#5E6B62]">Remove this subcategory?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await removeFieldSubcategory(active.id);
                          setSubId(category.subs.find((sub) => sub.id !== active.id)?.id ?? 0);
                          setConfirmRemoveSub(false);
                        })
                      }
                    >
                      Remove
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRemoveSub(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditSubTitle(active.title);
                        setEditSubQueries(active.queries.join(", "));
                        setEditSubMatch(active.matchTerms.join(", "));
                        setEditSubError("");
                        setEditingSub((value) => !value);
                      }}
                    >
                      {editingSub ? "Close" : "Edit subcategory"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirmRemoveSub(true)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              {editingSub ? (
                <form
                  className="grid gap-3 border-b border-[#1E3317]/10 px-4 py-3 sm:grid-cols-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editSubTitle.trim()) {
                      setEditSubError("Title is required.");
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
                      "Subcategory saved"
                    );
                  }}
                >
                  <div>
                    <Label htmlFor="edit-sub-title">
                      Title <span className="text-[#8E3B34]">*</span>
                    </Label>
                    <Input
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
                    <Label htmlFor="edit-sub-queries">Search queries</Label>
                    <Input
                      id="edit-sub-queries"
                      value={editSubQueries}
                      onChange={(event) => setEditSubQueries(event.target.value)}
                      aria-describedby="edit-sub-queries-help"
                      className={fieldClass}
                    />
                    <p id="edit-sub-queries-help" className="mt-1 text-xs text-[#5E6B62]">
                      Comma-separated. Slug stays {active.slug}.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="edit-sub-match">Match terms</Label>
                    <Input
                      id="edit-sub-match"
                      value={editSubMatch}
                      onChange={(event) => setEditSubMatch(event.target.value)}
                      aria-describedby="edit-sub-match-help"
                      className={fieldClass}
                    />
                    <p id="edit-sub-match-help" className="mt-1 text-xs text-[#5E6B62]">
                      Optional words matched against billing product names.
                    </p>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={pending}
                      className={cn("mt-3", notice === "Subcategory saved" && !pending ? "bg-[#245B3E] hover:bg-[#245B3E]" : primaryButton)}
                    >
                      {pending ? "Saving…" : notice === "Subcategory saved" ? "Saved" : "Save subcategory"}
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="border-b border-[#1E3317]/10 px-4 py-3">
                <Label htmlFor="pinned-filter" className="sr-only">
                  Filter pinned products
                </Label>
                <Input
                  id="pinned-filter"
                  value={productFilter}
                  onChange={(event) => setProductFilter(event.target.value)}
                  placeholder="Filter pinned products"
                  className="h-9 max-w-sm rounded-md border-[#1E3317]/15"
                />
              </div>

              {visibleProducts.length === 0 ? (
                <p className="px-4 py-8 text-sm text-[#5E6B62]">
                  {products.length === 0
                    ? "No products pinned. Search billing stock below, or create a SKU."
                    : "No pinned products match that filter."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-left text-xs text-[#5E6B62]">
                      <tr>
                        <th className="px-4 py-2 font-medium">Product</th>
                        <th className="px-4 py-2 font-medium">SKU</th>
                        <th className="px-4 py-2 text-right font-medium">Price</th>
                        <th className="px-4 py-2 text-right font-medium">Stock</th>
                        <th className="px-4 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => (
                        <tr key={product.id} className="border-t border-[#1E3317]/10">
                          <td className="px-4 py-2.5 font-medium">{product.name}</td>
                          <td className="px-4 py-2.5 text-[#5E6B62]">{product.sku || `ID ${product.id}`}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(product.saleRate)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{product.stockQty}</td>
                          <td className="px-4 py-2.5 text-right">
                            <Link href={`/field/products/${product.id}`} className="text-xs font-medium text-[#245B3E] hover:underline">
                              Details
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
                                    }, "Product unpinned")
                                  }
                                  className="text-xs font-medium text-[#8E3B34] hover:underline disabled:opacity-50"
                                >
                                  {pending ? "Unpinning…" : "Confirm"}
                                </button>
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => setUnpinId(null)}
                                  className="text-xs font-medium text-[#5E6B62] hover:underline disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => setUnpinId(product.id)}
                                className="ml-3 text-xs font-medium text-[#8E3B34] hover:underline disabled:opacity-50"
                              >
                                Unpin
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-3 border-t border-[#1E3317]/10 px-4 py-4">
                <h3 className="text-sm font-semibold text-[#1E3317]">Pin a billing product</h3>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder="Search name or SKU"
                    aria-label="Search billing products"
                    className="h-9 rounded-md border-[#1E3317]/15"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        searchProducts();
                      }
                    }}
                  />
                  <Button type="button" size="sm" disabled={pending} onClick={searchProducts} className={primaryButton}>
                    {pending ? "Searching…" : "Search"}
                  </Button>
                </div>
                {hits && hits.length === 0 ? (
                  <p className="text-sm text-[#5E6B62]">No billing products matched.</p>
                ) : null}
                {hits && hits.length > 0 ? (
                  <ul className="divide-y divide-[#1E3317]/10 rounded-md border border-[#1E3317]/10">
                    {hits.map((hit) => (
                      <li key={hit.productId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{hit.name}</span>
                          <span className="text-xs text-[#5E6B62]">
                            {hit.sku || `ID ${hit.productId}`} · {formatCurrency(hit.saleRate)} · stock {hit.productStockQty}
                          </span>
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          className={primaryButton}
                          onClick={() => run(() => pinProductToSub(active.id, hit.productId), "Product pinned")}
                        >
                          Pin
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <button
                  type="button"
                  onClick={() => setCreatingSku((value) => !value)}
                  className="text-xs font-medium text-[#245B3E] hover:underline"
                >
                  {creatingSku ? "Close new SKU" : "Create a billing SKU and pin it"}
                </button>
                {creatingSku ? (
                  <form
                    className="space-y-3 rounded-md border border-[#1E3317]/10 p-3"
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
                      }, "SKU created and pinned");
                    }}
                  >
                    <div>
                      <Label htmlFor="sku-name">
                        Name <span className="text-[#8E3B34]">*</span>
                      </Label>
                      <Input
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
                        <Label htmlFor="sku-code">SKU</Label>
                        <Input
                          id="sku-code"
                          value={newSku}
                          onChange={(event) => setNewSku(event.target.value)}
                          aria-describedby="sku-code-help"
                          className={fieldClass}
                        />
                        <p id="sku-code-help" className="mt-1 text-xs text-[#5E6B62]">
                          Optional. A code is taken from the name when this is blank.
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="sku-rate">
                          Sale rate <span className="text-[#8E3B34]">*</span>
                        </Label>
                        <Input
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
                        <Label htmlFor="sku-gst">GST %</Label>
                        <Input
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
                            Defaults to 18 when left as 18.
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="sku-hsn">
                          HSN <span className="text-[#8E3B34]">*</span>
                        </Label>
                        <Input
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
                    <Button
                      type="submit"
                      size="sm"
                      disabled={pending}
                      className={notice === "SKU created and pinned" && !pending ? "bg-[#245B3E] hover:bg-[#245B3E]" : primaryButton}
                    >
                      {pending ? "Saving…" : notice === "SKU created and pinned" ? "Saved" : "Create and pin"}
                    </Button>
                  </form>
                ) : null}
              </div>
            </>
          ) : (
            <p className="px-4 py-10 text-sm text-[#5E6B62]">Add a subcategory to start pinning products.</p>
          )}
        </section>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[#8E3B34]">
          {error}
        </p>
      ) : null}
      {notice && !error ? (
        <p role="status" className="text-sm text-[#245B3E]">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
