"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteFieldRecommendationAction,
  saveFieldRecommendationAction,
  searchFieldRecommendationFarmers,
  searchFieldRecommendationProducts,
} from "@/lib/actions/field";
import { Package, Pencil, Search, Sparkles, Trash2, X } from "lucide-react";
import { roleLabel } from "@/lib/user-roles";
import { Badge, EmptyState, Notice, PageHeader, SearchBox, buttonClass, inputClass, labelClass } from "@/components/field/kit";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

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

function savedOn(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, {
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
  const t = useFieldText();
  const r = t.recs;
  const locale = fieldLocale(useFieldLang());
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
    window.scrollTo?.({ top: 0, behavior: "smooth" });
    document.getElementById("rec-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      setError(r.chooseFarmer);
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
    if (!window.confirm(fmt(r.removeConfirm, { crop: row.crop, problem: row.problem }))) return;
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

  const field = (id: string, label: string, value: string, key: keyof typeof empty, max: number, ph: string, wide = false) => (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} value={value} maxLength={max} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={ph} className={inputClass} />
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title={r.title} description={r.subtitle} />
      <div className={cn("grid items-start gap-6", canEdit && "xl:grid-cols-[26rem_minmax(0,1fr)]")}>
        {canEdit ? (
          <form
            id="rec-form"
            className={cn(
              "space-y-4 rounded-2xl border bg-white p-5 shadow-sm xl:sticky xl:top-4",
              editingId ? "border-[#3E5E2F] ring-2 ring-[#C6E26A]/50" : "border-[#1E3317]/10"
            )}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-[#1E3317]">
                <Sparkles className="h-4 w-4 text-[#3E5E2F]" />
                {editingId ? r.editTitle : r.newTitle}
              </h2>
              {editingId ? (
                <button type="button" onClick={resetForm} className={buttonClass("ghost", "sm")}>
                  {r.cancelEdit}
                </button>
              ) : null}
            </div>
            <div className="relative">
              <label htmlFor="rec-farmer" className={labelClass}>
                {r.farmer} <span className="text-[#8E3B34]">*</span>
              </label>
              {farmer ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[#3E5E2F]/25 bg-[#F4F8EF] px-3 py-2.5">
                  <span className="min-w-0 truncate text-sm font-semibold text-[#1E3317]">
                    {farmer.name}
                    {farmer.village ? <span className="font-normal text-[#5E6B62]"> · {farmer.village}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFarmer(null);
                      setFarmerOpen(true);
                    }}
                    className="shrink-0 text-xs font-semibold text-[#245B3E] hover:underline"
                  >
                    {r.change}
                  </button>
                </div>
              ) : (
                <>
                  <input
                    id="rec-farmer"
                    value={farmerQuery}
                    onFocus={() => setFarmerOpen(true)}
                    onChange={(event) => {
                      setFarmerQuery(event.target.value);
                      setFarmerOpen(true);
                    }}
                    placeholder={r.farmerPh}
                    className={inputClass}
                  />
                  {farmerOpen && farmerHits.length > 0 ? (
                    <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#1E3317]/10 bg-white shadow-lg">
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
                            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-[#F4F8EF]"
                          >
                            <span className="font-medium text-[#1E3317]">{hit.name}</span>
                            <span className="text-xs text-[#5E6B62]">{[hit.village, hit.phone].filter(Boolean).join(" · ")}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("rec-crop", r.crop, form.crop, "crop", 40, r.cropPh)}
              {field("rec-stage", r.stage, form.stage, "stage", 80, r.stagePh)}
              {field("rec-problem", r.problem, form.problem, "problem", 160, r.problemPh, true)}
              {field("rec-note", r.note, form.note, "note", 500, r.notePh, true)}
            </div>
            <div className="relative">
              <label htmlFor="rec-product" className={labelClass}>
                {r.products} <span className="text-[#8E3B34]">*</span>
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5E6B62]" />
                <input id="rec-product" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder={r.productsPh} className={cn(inputClass, "pl-9")} />
              </div>
              {searching ? <p className="mt-1 text-xs text-[#5E6B62]">{r.searching}</p> : null}
              {hits.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[#1E3317]/10 bg-white shadow-lg">
                  {hits.map((product) => (
                    <li key={product.id}>
                      <button type="button" onClick={() => addProduct(product)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-[#F4F8EF]">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[#1E3317]">{product.name}</span>
                          {product.sku ? <span className="font-mono text-xs text-[#5E6B62]">{product.sku}</span> : null}
                        </span>
                        <Badge tone={product.stock > 0 ? "green" : "red"}>{product.stock > 0 ? fmt(r.inStock, { n: product.stock }) : r.outOfStock}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.map((product) => (
                  <span key={product.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#EDF2E7] py-1 pl-3 pr-1 text-xs font-medium text-[#245B3E]">
                    <span className="truncate">{product.name}</span>
                    <button
                      type="button"
                      aria-label={`${t.common.remove} ${product.name}`}
                      onClick={() => setSelected((current) => current.filter((item) => item.id !== product.id))}
                      className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[#D6E5C8]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#5E6B62]">
                {r.chooseProducts} ({selected.length}/8)
              </p>
            </div>
            {error ? <Notice tone="red">{error}</Notice> : null}
            <button type="submit" disabled={pending} className={cn(buttonClass("primary"), "w-full")}>
              {pending ? t.common.saving : editingId ? r.save : r.add}
            </button>
          </form>
        ) : (
          <Notice tone="amber">{r.onlyOfficers}</Notice>
        )}

        <section className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold text-[#1E3317]">{fmt(filtered.length === 1 ? r.countOne : r.count, { n: filtered.length })}</h2>
            <SearchBox value={listQuery} onChange={setListQuery} placeholder={r.listSearchPh} label={r.listSearchPh} />
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#1E3317]/15 bg-white">
              <EmptyState icon={<Sparkles />} title={r.empty} body={canEdit ? r.emptyEdit : r.emptyView} />
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((row) => (
                <li
                  key={row.id}
                  className={cn("rounded-2xl border bg-white p-4 shadow-sm sm:p-5", editingId === row.id ? "border-[#3E5E2F] ring-2 ring-[#C6E26A]/50" : "border-[#1E3317]/10")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-[#1E3317]">{row.farmerName || `#${row.farmerId}`}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {row.crop ? <Badge tone="green">{row.crop}</Badge> : null}
                        {row.stage ? <Badge tone="grey">{row.stage}</Badge> : null}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(row)} className={buttonClass("secondary", "sm")}>
                          <Pencil aria-hidden /> {t.common.edit}
                        </button>
                        <button type="button" disabled={pending} onClick={() => remove(row)} className={buttonClass("danger", "sm")} aria-label={t.common.remove}>
                          <Trash2 aria-hidden />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {row.problem ? <p className="mt-3 text-sm font-medium text-[#29332C]">{row.problem}</p> : null}
                  {row.note ? <p className="mt-1 text-sm leading-6 text-[#5E6B62]">{row.note}</p> : null}
                  {row.products.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {row.products.map((product) => (
                        <li key={product.id} className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E3317]/10 bg-[#FAFBF7] px-2.5 py-1.5 text-xs">
                          <Package className="h-3.5 w-3.5 text-[#3E5E2F]" />
                          <span className="font-medium text-[#1E3317]">{product.name}</span>
                          {product.sku ? <span className="font-mono text-[#5E6B62]">{product.sku}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-3 border-t border-[#1E3317]/8 pt-3 text-xs text-[#5E6B62]">
                    {fmt(r.addedBy, { name: row.authorName })} · {roleLabel(row.authorRole)}
                    {savedOn(row.updatedAt, locale) ? ` · ${savedOn(row.updatedAt, locale)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {!canEdit && error ? <Notice tone="red">{error}</Notice> : null}
        </section>
      </div>
    </div>
  );
}
