"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, FolderTree, Layers, Package, Plus } from "lucide-react";
import { moveFieldCategoryAction, saveFieldCategory } from "@/lib/actions/field";
import { EmptyState, PageHeader, SearchBox, StatCard, StatGrid, buttonClass, inputClass, labelClass, Notice } from "@/components/field/kit";
import { Modal } from "@/components/field/modal";
import { useFieldText } from "@/components/field/lang";
import { plural } from "@/lib/field-i18n";

export type CatalogSummary = {
  id: number;
  slug: string;
  title: string;
  iconUri: string | null;
  subcategories: number;
  skus: number;
  subNames: string[];
};

export function CatalogIndex({ categories }: { categories: CatalogSummary[] }) {
  const t = useFieldText();
  const c = t.catalog;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const rows = categories.filter(
    (category) =>
      !needle ||
      category.title.toLowerCase().includes(needle) ||
      category.slug.toLowerCase().includes(needle) ||
      category.subNames.some((name) => name.toLowerCase().includes(needle))
  );
  const router = useRouter();
  const [moving, startMove] = useTransition();
  const [moveError, setMoveError] = useState("");
  function move(id: number, direction: "up" | "down") {
    setMoveError("");
    startMove(async () => {
      try {
        await moveFieldCategoryAction(id, direction);
        router.refresh();
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : t.common.somethingWrong);
      }
    });
  }
  const subs = categories.reduce((sum, cat) => sum + cat.subcategories, 0);
  const skus = categories.reduce((sum, cat) => sum + cat.skus, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={c.title}
        description={c.subtitle}
        actions={
          <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary")}>
            <Plus aria-hidden /> {c.add}
          </button>
        }
      />

      <StatGrid cols={3}>
        <StatCard icon={<FolderTree />} label={c.statCategories} value={categories.length} />
        <StatCard icon={<Layers />} label={c.subcats} value={subs} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard icon={<Package />} label={c.statProducts} value={skus.toLocaleString("en-IN")} />
        </div>
      </StatGrid>

      <SearchBox value={query} onChange={setQuery} placeholder={c.searchPh} label={c.searchPh} />
      <p className="text-xs text-[#5E6B62]">{needle ? c.orderFilterOff : c.orderHelp}</p>
      {moveError ? <Notice tone="red">{moveError}</Notice> : null}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1E3317]/15 bg-white">
          <EmptyState
            icon={<FolderTree />}
            title={categories.length === 0 ? c.empty : c.noMatch}
            body={categories.length === 0 ? c.emptyBody : t.common.tryAnother}
            action={
              categories.length === 0 ? (
                <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary")}>
                  <Plus aria-hidden /> {c.add}
                </button>
              ) : (
                <button type="button" onClick={() => setQuery("")} className={buttonClass("secondary")}>
                  {t.common.clearSearch}
                </button>
              )
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((category, index) => (
            <li key={category.id} className="relative">
              {!needle ? (
                <div className="absolute right-10 top-3 z-10 flex gap-1">
                  <button
                    type="button"
                    aria-label={`${c.moveUp}: ${category.title}`}
                    title={c.moveUp}
                    disabled={moving || index === 0}
                    onClick={() => move(category.id, "up")}
                    className="rounded-lg border border-[#1E3317]/10 bg-white p-1 text-[#3E5E2F] hover:bg-[#F4F8EF] disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${c.moveDown}: ${category.title}`}
                    title={c.moveDown}
                    disabled={moving || index === rows.length - 1}
                    onClick={() => move(category.id, "down")}
                    className="rounded-lg border border-[#1E3317]/10 bg-white p-1 text-[#3E5E2F] hover:bg-[#F4F8EF] disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ) : null}
              <Link
                href={`/field/catalog/${category.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-[#1E3317]/10 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#1E3317]/25 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A]"
              >
                <div className="mb-3 flex items-start gap-3 pr-14">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EDF2E7] text-base font-bold text-[#3E5E2F]">
                    {category.iconUri ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={category.iconUri} alt="" className="h-full w-full object-contain p-1" />
                    ) : (
                      category.title.trim().charAt(0).toUpperCase() || "•"
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-[#1E3317]">{category.title}</p>
                    <p className="truncate text-xs text-[#5E6B62]">/{category.slug}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#5E6B62] transition group-hover:translate-x-0.5" />
                </div>
                {category.subNames.length ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {category.subNames.map((name) => (
                      <span key={name} className="max-w-full truncate rounded-full bg-[#F4F3EE] px-2.5 py-0.5 text-[11px] font-medium text-[#3E5E2F]">
                        {name}
                      </span>
                    ))}
                    {category.subcategories > category.subNames.length ? (
                      <span className="rounded-full bg-[#F4F3EE] px-2.5 py-0.5 text-[11px] font-medium text-[#5E6B62]">
                        +{category.subcategories - category.subNames.length}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-auto flex items-center gap-4 border-t border-[#1E3317]/8 pt-3 text-xs text-[#5E6B62]">
                  <span>{plural(category.subcategories, c.subcategory, c.subcategories)}</span>
                  <span className="font-semibold text-[#1E3317]">{plural(category.skus, c.product, c.products)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {open ? <AddCategoryDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function AddCategoryDialog({ onClose }: { onClose: () => void }) {
  const t = useFieldText();
  const c = t.catalog;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [queries, setQueries] = useState("");
  const [titleError, setTitleError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function submit() {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitleError(c.titleRequired);
      return;
    }
    setTitleError("");
    setError("");
    start(async () => {
      try {
        await saveFieldCategory({ title: nextTitle, queries });
        setSaved(true);
        router.refresh();
        window.setTimeout(onClose, 500);
      } catch (err) {
        setError(err instanceof Error ? err.message : c.saveFailed);
      }
    });
  }

  return (
    <Modal title={c.addTitle} description={c.addHelp} onClose={onClose} busy={pending} closeLabel={t.common.close}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div>
          <label htmlFor="new-category-title" className={labelClass}>
            {c.fieldTitle} <span className="text-[#8E3B34]">*</span>
          </label>
          <input
            id="new-category-title"
            autoFocus
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (titleError) setTitleError("");
            }}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "new-category-title-error" : undefined}
            className={inputClass}
          />
          {titleError ? (
            <p id="new-category-title-error" className="mt-1 text-xs font-medium text-[#8E3B34]">
              {titleError}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="new-category-queries" className={labelClass}>
            {c.fieldQueries} <span className="font-normal text-[#5E6B62]">({t.common.optional})</span>
          </label>
          <input
            id="new-category-queries"
            value={queries}
            onChange={(event) => setQueries(event.target.value)}
            placeholder="weeder, harvester"
            aria-describedby="new-category-queries-help"
            className={inputClass}
          />
          <p id="new-category-queries-help" className="mt-1 text-xs text-[#5E6B62]">
            {c.queriesHelp}
          </p>
        </div>
        {error ? <Notice tone="red">{error}</Notice> : null}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" disabled={pending} onClick={onClose} className={buttonClass("secondary")}>
            {t.common.cancel}
          </button>
          <button type="submit" disabled={pending} className={buttonClass(saved ? "lime" : "primary")}>
            {saved ? t.common.saved : pending ? t.common.saving : c.add}
          </button>
        </div>
      </form>
    </Modal>
  );
}
