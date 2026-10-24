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
import { formatCurrency } from "@/lib/utils";
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
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [catTitle, setCatTitle] = useState(category.title);
  const [catQueries, setCatQueries] = useState(category.queries.join(", "));
  const [subTitle, setSubTitle] = useState("");
  const [subQueries, setSubQueries] = useState("");
  const [subMatch, setSubMatch] = useState("");
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newRate, setNewRate] = useState("");
  const [newGst, setNewGst] = useState("18");
  const [newHsn, setNewHsn] = useState("");

  const productsBySub = useMemo(() => {
    const map = new Map<number, FieldCatalogProduct[]>();
    for (const set of productSets) map.set(set.subcategoryId, set.products);
    return map;
  }, [productSets]);

  const active = category.subs.find((sub) => sub.id === subId) ?? category.subs[0];
  const products = active ? productsBySub.get(active.id) ?? [] : [];

  function run(fn: () => Promise<void>) {
    setError("");
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#2E4A22]/50">Category</p>
          <h1 className="text-2xl font-bold">{category.title}</h1>
        </div>
        <Button
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
          Delete category
        </Button>
      </div>

      <form
        className="grid gap-3 rounded-2xl border border-[#1E3317]/10 bg-white p-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveFieldCategory({ id: category.id, title: catTitle, queries: catQueries }));
        }}
      >
        <div>
          <Label>Title</Label>
          <Input value={catTitle} onChange={(e) => setCatTitle(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Search queries</Label>
          <Input value={catQueries} onChange={(e) => setCatQueries(e.target.value)} />
        </div>
        <Button type="submit" disabled={pending} className="sm:col-span-3 w-fit">
          Save category
        </Button>
      </form>

      <div className="flex min-h-[520px] overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white">
        <aside className="w-24 shrink-0 border-r border-[#1E3317]/10 bg-[#FFF7F5]">
          {category.subs.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSubId(sub.id)}
              className={`flex w-full flex-col items-center gap-1 px-2 py-4 text-center text-xs font-semibold ${
                sub.id === active?.id ? "bg-[#B8D94A] text-[#1E3317]" : "text-[#2E4A22]/70 hover:bg-white"
              }`}
            >
              <span>{sub.title}</span>
              <span className="text-[10px] font-normal">{sub.productIds.length}</span>
            </button>
          ))}
        </aside>
        <div className="min-w-0 flex-1 p-4">
          {active ? (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">{active.title}</h2>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await removeFieldSubcategory(active.id);
                      setSubId(category.subs.find((sub) => sub.id !== active.id)?.id ?? 0);
                    })
                  }
                >
                  Remove rail
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {products.map((product) => (
                  <div key={product.id} className="rounded-xl border border-[#1E3317]/10 p-3">
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-xs text-[#2E4A22]/60">{product.sku || `ID ${product.id}`}</p>
                    <p className="mt-1 text-sm">{formatCurrency(product.saleRate)} · stock {product.stockQty}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-rose-600"
                      disabled={pending}
                      onClick={() => run(() => unpinProductFromSub(active.id, product.id))}
                    >
                      Unpin
                    </Button>
                    <Link
                      href={`/field/products/${product.id}`}
                      className="ml-2 text-sm font-semibold text-[#2E4A22] hover:underline"
                    >
                      Edit details
                    </Link>
                  </div>
                ))}
                {products.length === 0 ? (
                  <p className="text-sm text-[#2E4A22]/60">No products pinned. Search billing stock or add a SKU.</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#2E4A22]/60">Add a subcategory rail to start pinning products.</p>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
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
            });
          }}
        >
          <h3 className="font-semibold">Add subcategory</h3>
          <Input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} placeholder="Title" required />
          <Input value={subQueries} onChange={(e) => setSubQueries(e.target.value)} placeholder="Queries, comma separated" />
          <Input value={subMatch} onChange={(e) => setSubMatch(e.target.value)} placeholder="Match terms" />
          <Button type="submit" disabled={pending || !subTitle.trim()}>
            Add rail
          </Button>
        </form>

        {active ? (
          <div className="space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-4">
            <h3 className="font-semibold">Assign billing product to {active.title}</h3>
            <div className="flex gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or SKU"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    run(async () => {
                      const rows = await searchBillingProducts(q);
                      setHits(rows.map((row) => ({
                        productId: row.productId,
                        name: row.name,
                        sku: row.sku,
                        productStockQty: row.productStockQty,
                        saleRate: row.saleRate,
                      })));
                    });
                  }
                }}
              />
              <Button
                type="button"
                disabled={pending || !q.trim()}
                onClick={() =>
                  run(async () => {
                    const rows = await searchBillingProducts(q);
                    setHits(rows.map((row) => ({
                      productId: row.productId,
                      name: row.name,
                      sku: row.sku,
                      productStockQty: row.productStockQty,
                      saleRate: row.saleRate,
                    })));
                  })
                }
              >
                Search
              </Button>
            </div>
            <div className="max-h-48 space-y-2 overflow-auto">
              {hits.map((hit) => (
                <div key={hit.productId} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {hit.name} <span className="text-[#2E4A22]/50">{hit.sku}</span>
                  </span>
                  <Button size="sm" disabled={pending} onClick={() => run(() => pinProductToSub(active.id, hit.productId))}>
                    Pin
                  </Button>
                </div>
              ))}
            </div>
            <form
              className="space-y-2 border-t border-[#1E3317]/10 pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await createBillingProductForSub(active.id, {
                    name: newName,
                    sku: newSku || undefined,
                    saleRate: Number(newRate),
                    gstRate: Number(newGst) || 18,
                    hsnCode: newHsn,
                  });
                  setNewName("");
                  setNewSku("");
                  setNewRate("");
                  setNewHsn("");
                });
              }}
            >
              <h4 className="text-sm font-semibold">Create new billing SKU</h4>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" required />
              <div className="grid grid-cols-2 gap-2">
                <Input value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder="SKU" />
                <Input value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="Sale rate" required />
                <Input value={newGst} onChange={(e) => setNewGst(e.target.value)} placeholder="GST %" />
                <Input value={newHsn} onChange={(e) => setNewHsn(e.target.value)} placeholder="HSN" required />
              </div>
              <Button type="submit" disabled={pending}>
                Create and pin
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
