"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveFieldCategory } from "@/lib/actions/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CatalogSummary = {
  id: number;
  slug: string;
  title: string;
  subcategories: number;
  skus: number;
};

const fieldClass =
  "mt-1 h-9 rounded-md border-[#1E3317]/15 text-sm focus-visible:ring-[#1E3317]";

export function CatalogIndex({ categories }: { categories: CatalogSummary[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const rows = categories.filter(
    (category) =>
      !needle ||
      category.title.toLowerCase().includes(needle) ||
      category.slug.toLowerCase().includes(needle)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="catalog-search">
          Search categories
        </label>
        <Input
          id="catalog-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search categories"
          className="h-9 max-w-sm rounded-md border-[#1E3317]/15"
        />
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="h-9 bg-[#1E3317] hover:bg-[#245B3E] sm:ml-auto"
        >
          Add category
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#1E3317]/10 bg-white">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-[#1E3317]">
              {categories.length === 0 ? "No categories yet" : "No matching categories"}
            </p>
            <p className="mt-1 text-sm text-[#5E6B62]">
              {categories.length === 0
                ? "Add a category, then add subcategories and pin billing products."
                : "Try another name or slug."}
            </p>
          </div>
        ) : (
          <ul>
            {rows.map((category) => (
              <li key={category.id} className="border-t border-[#1E3317]/10 first:border-t-0">
                <Link
                  href={`/field/catalog/${category.slug}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-[#F7F6F1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3317]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#1E3317]">{category.title}</span>
                    <span className="block truncate text-xs text-[#5E6B62]">{category.slug}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-[#5E6B62]">
                    {category.subcategories} {category.subcategories === 1 ? "subcategory" : "subcategories"}
                    <span className="mx-1.5 text-[#1E3317]/20">·</span>
                    {category.skus} {category.skus === 1 ? "SKU" : "SKUs"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open ? <AddCategoryDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function AddCategoryDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [queries, setQueries] = useState("");
  const [titleError, setTitleError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function submit() {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setTitleError("Title is required.");
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
        setError(err instanceof Error ? err.message : "Could not save category");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[#1E3317]/40" onClick={() => !pending && onClose()} />
      <form
        role="dialog"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-lg border border-[#1E3317]/10 bg-white p-4 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 id={titleId} className="text-base font-semibold text-[#1E3317]">
          Add category
        </h2>
        <p className="mt-1 text-xs leading-5 text-[#5E6B62]">
          The title becomes the category the Field app shows. Search queries are optional words used to find products.
        </p>
        <div className="mt-4">
          <Label htmlFor="new-category-title">
            Title <span className="text-[#8E3B34]">*</span>
          </Label>
          <Input
            id="new-category-title"
            autoFocus
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (titleError) setTitleError("");
            }}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "new-category-title-error" : undefined}
            className={fieldClass}
          />
          {titleError ? (
            <p id="new-category-title-error" className="mt-1 text-xs text-[#8E3B34]">
              {titleError}
            </p>
          ) : null}
        </div>
        <div className="mt-3">
          <Label htmlFor="new-category-queries">Search queries</Label>
          <Input
            id="new-category-queries"
            value={queries}
            onChange={(event) => setQueries(event.target.value)}
            placeholder="weeder, harvester"
            aria-describedby="new-category-queries-help"
            className={fieldClass}
          />
          <p id="new-category-queries-help" className="mt-1 text-xs text-[#5E6B62]">
            Separate words with commas. Leave blank if you will pin products by hand.
          </p>
        </div>
        {error ? <p className="mt-3 text-sm text-[#8E3B34]">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending}
            className={saved ? "bg-[#245B3E] hover:bg-[#245B3E]" : "bg-[#1E3317] hover:bg-[#245B3E]"}
          >
            {saved ? "Saved" : pending ? "Saving…" : "Add category"}
          </Button>
        </div>
      </form>
    </div>
  );
}
