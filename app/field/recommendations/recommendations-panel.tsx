"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteFieldRecommendationAction,
  saveFieldRecommendationAction,
  searchFieldRecommendationFarmers,
  searchFieldRecommendationProducts,
} from "@/lib/actions/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabel } from "@/lib/user-roles";

type Product = { id: number; name: string; sku: string; price: number; stock: number };
type Farmer = { id: number; name: string; phone: string; village: string };

export type RecommendationRow = {
  id: number;
  farmerId: number;
  farmerName: string;
  crop: string;
  stage: string;
  problem: string;
  note: string;
  productIds: number[];
  products: Product[];
  authorName: string;
  authorRole: string;
  updatedAt: string;
};

const empty = { crop: "", stage: "", problem: "", note: "" };

function savedOn(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RecommendationsPanel({
  initial,
  canEdit,
}: {
  initial: RecommendationRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(initial);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(empty);
  const [selected, setSelected] = useState<Product[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [hits, setHits] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [farmerQuery, setFarmerQuery] = useState("");
  const [farmerHits, setFarmerHits] = useState<Farmer[]>([]);
  const [farmerOpen, setFarmerOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    if (!canEdit) return;
    const q = productQuery.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      setSearching(true);
      void searchFieldRecommendationProducts(q)
        .then((result) => {
          if (!alive) return;
          if (!result.ok) {
            setError(result.error);
            setHits([]);
            return;
          }
          setHits(result.products.filter((product) => !selected.some((item) => item.id === product.id)));
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [productQuery, selected, canEdit]);

  // Farmer picker: the server returns only farmers this user may recommend for.
  useEffect(() => {
    if (!canEdit || !farmerOpen) return;
    let alive = true;
    const timer = setTimeout(() => {
      void searchFieldRecommendationFarmers(farmerQuery.trim()).then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setError(result.error);
          setFarmerHits([]);
          return;
        }
        setFarmerHits(result.farmers);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [farmerQuery, farmerOpen, canEdit]);

  const filtered = useMemo(() => {
    const needle = listQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const products = row.products.map((product) => `${product.name} ${product.sku}`).join(" ");
      return `${row.farmerName} ${row.crop} ${row.stage} ${row.problem} ${row.note} ${row.authorName} ${products}`
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, listQuery]);

  function resetForm() {
    setEditingId(null);
    setForm(empty);
    setFarmer(null);
    setFarmerQuery("");
    setFarmerHits([]);
    setFarmerOpen(false);
    setSelected([]);
    setProductQuery("");
    setHits([]);
    setError("");
  }

  function startEdit(row: RecommendationRow) {
    setEditingId(row.id);
    setFarmer({ id: row.farmerId, name: row.farmerName || `Farmer ${row.farmerId}`, phone: "", village: "" });
    setFarmerOpen(false);
    setForm({ crop: row.crop, stage: row.stage, problem: row.problem, note: row.note });
    setSelected(row.products);
    setProductQuery("");
    setHits([]);
    setError("");
  }

  function addProduct(product: Product) {
    setSelected((current) => (current.some((item) => item.id === product.id) || current.length >= 8 ? current : [...current, product]));
    setProductQuery("");
    setHits([]);
  }

  function submit() {
    setError("");
    if (!farmer) {
      setError("Choose the farmer.");
      return;
    }
    start(async () => {
      const result = await saveFieldRecommendationAction({
        id: editingId ?? undefined,
        farmerId: farmer.id,
        ...form,
        productIds: selected.map((product) => product.id),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function remove(row: RecommendationRow) {
    if (!window.confirm(`Remove the ${row.crop} recommendation “${row.problem}”?`)) return;
    setError("");
    start(async () => {
      const result = await deleteFieldRecommendationAction(row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (editingId === row.id) resetForm();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {canEdit ? (
        <form
          className="space-y-4 rounded-lg border border-[#1E3317]/10 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#1E3317]">
              {editingId ? "Edit recommendation" : "New recommendation"}
            </h2>
            {editingId ? (
              <button type="button" onClick={resetForm} className="text-xs font-medium text-[#245B3E] hover:underline">
                Cancel edit
              </button>
            ) : null}
          </div>
          <div className="relative">
            <Label htmlFor="rec-farmer">Farmer</Label>
            {farmer ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#EEF1E6] px-3 py-1 text-xs font-medium text-[#245B3E]">
                  {farmer.name}
                  {farmer.village ? ` · ${farmer.village}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFarmer(null);
                    setFarmerOpen(true);
                  }}
                  className="text-xs font-medium text-[#245B3E] hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="rec-farmer"
                  value={farmerQuery}
                  onFocus={() => setFarmerOpen(true)}
                  onChange={(event) => {
                    setFarmerQuery(event.target.value);
                    setFarmerOpen(true);
                  }}
                  placeholder="Search your farmers by name, phone or village"
                />
                {farmerOpen && farmerHits.length > 0 ? (
                  <ul className="mt-2 max-h-64 overflow-auto rounded-md border border-[#1E3317]/10">
                    {farmerHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setFarmer(hit);
                            setFarmerQuery("");
                            setFarmerHits([]);
                            setFarmerOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#F4F3EE]"
                        >
                          <span>{hit.name}</span>
                          <span className="text-xs text-[#5E6B62]">{[hit.village, hit.phone].filter(Boolean).join(" · ")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rec-crop">Crop</Label>
              <Input id="rec-crop" value={form.crop} maxLength={40} onChange={(event) => setForm({ ...form, crop: event.target.value })} placeholder="Paddy" />
            </div>
            <div>
              <Label htmlFor="rec-stage">Stage</Label>
              <Input id="rec-stage" value={form.stage} maxLength={80} onChange={(event) => setForm({ ...form, stage: event.target.value })} placeholder="Flowering" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="rec-problem">Problem</Label>
              <Input id="rec-problem" value={form.problem} maxLength={160} onChange={(event) => setForm({ ...form, problem: event.target.value })} placeholder="Grain filling" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="rec-note">Note</Label>
              <Input id="rec-note" value={form.note} maxLength={500} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Suggestions only. The officer can order any in-stock product." />
            </div>
          </div>
          <div>
            <Label htmlFor="rec-product">Products</Label>
            <Input
              id="rec-product"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search the field catalogue by name or SKU"
            />
            {searching ? <p className="mt-1 text-xs text-[#5E6B62]">Searching…</p> : null}
            {hits.length > 0 ? (
              <ul className="mt-2 overflow-hidden rounded-md border border-[#1E3317]/10">
                {hits.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => addProduct(product)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#F4F3EE]"
                    >
                      <span>
                        {product.name}
                        {product.sku ? <span className="text-[#5E6B62]"> · {product.sku}</span> : null}
                      </span>
                      <span className="text-xs text-[#5E6B62]">{product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelected((current) => current.filter((item) => item.id !== product.id))}
                  className="rounded-full bg-[#EEF1E6] px-3 py-1 text-xs font-medium text-[#245B3E]"
                >
                  {product.name} ×
                </button>
              ))}
              {selected.length === 0 ? <p className="text-xs text-[#5E6B62]">Choose at least one product. Up to 8.</p> : null}
            </div>
          </div>
          {error ? <p className="text-sm text-[#8E3B34]">{error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editingId ? "Save changes" : "Add recommendation"}
          </Button>
        </form>
      ) : (
        <p className="rounded-lg border border-[#1E3317]/10 bg-white px-4 py-3 text-sm text-[#5E6B62]">
          Only field officers can add or change recommendations.
        </p>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#1E3317]">{filtered.length} recommendation{filtered.length === 1 ? "" : "s"}</h2>
          <Input
            value={listQuery}
            onChange={(event) => setListQuery(event.target.value)}
            placeholder="Search farmer, crop, problem, product, or author"
            className="max-w-sm"
          />
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-[#1E3317]/10 bg-white px-4 py-10 text-center">
            <p className="text-sm font-medium text-[#1E3317]">No recommendations yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-[#5E6B62]">
              {canEdit ? "Add the first recommendation for one of your farmers above." : "A field officer has not added one yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#1E3317]/10 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-[#1E3317]/10 text-left text-xs text-[#5E6B62]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Farmer</th>
                    <th className="px-3 py-2 font-medium">Crop</th>
                    <th className="px-3 py-2 font-medium">Problem</th>
                    <th className="px-3 py-2 font-medium">Products</th>
                    <th className="px-3 py-2 font-medium">Added by</th>
                    {canEdit ? <th className="px-3 py-2 font-medium"> </th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-t border-[#1E3317]/10 align-top">
                      <td className="px-3 py-3 font-medium text-[#1E3317]">{row.farmerName || `Farmer ${row.farmerId}`}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-[#1E3317]">{row.crop}</p>
                        {row.stage ? <p className="text-xs text-[#5E6B62]">{row.stage}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        <p>{row.problem}</p>
                        {row.note ? <p className="mt-1 max-w-xs text-xs text-[#5E6B62]">{row.note}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-[#1E3317]">
                        {row.products.length
                          ? row.products.map((product) => (
                              <p key={product.id}>
                                {product.name}
                                {product.sku ? <span className="text-[#5E6B62]"> · {product.sku}</span> : null}
                              </p>
                            ))
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <p>{row.authorName}</p>
                        <p className="text-xs text-[#5E6B62]">
                          {roleLabel(row.authorRole)}
                          {savedOn(row.updatedAt) ? ` · ${savedOn(row.updatedAt)}` : ""}
                        </p>
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => startEdit(row)} className="text-xs font-medium text-[#245B3E] hover:underline">
                            Edit
                          </button>
                          <button type="button" onClick={() => remove(row)} className="ml-3 text-xs font-medium text-[#8E3B34] hover:underline">
                            Remove
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!canEdit && error ? <p className="text-sm text-[#8E3B34]">{error}</p> : null}
      </div>
    </div>
  );
}
