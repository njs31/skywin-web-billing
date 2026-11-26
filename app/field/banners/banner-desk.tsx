"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Images, Trash2 } from "lucide-react";
import {
  moveFieldBannerAction,
  removeFieldBanner,
  saveFieldBanner,
  setFieldBannerShown,
} from "@/lib/actions/field";
import { Badge, Notice, PageHeader, buttonClass, inputClass, labelClass } from "@/components/field/kit";
import { useFieldText } from "@/components/field/lang";
import { ProductPicker, type PickedProduct } from "@/components/field/product-picker";
import { fmt } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type BannerRow = {
  id: number;
  imageUrl: string;
  placement: string;
  categoryId: number | null;
  categoryTitle: string | null;
  productId: number | null;
  productName: string | null;
  title: string | null;
  active: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
};

export function BannerDesk({
  canEdit,
  banners,
  categories,
}: {
  canEdit: boolean;
  banners: BannerRow[];
  categories: Array<{ id: number; slug: string; title: string }>;
}) {
  const t = useFieldText();
  const b = t.banners;
  const router = useRouter();
  const [where, setWhere] = useState("products");
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const pages = useMemo(() => {
    const list: Array<{ key: string; label: string; rows: BannerRow[] }> = [
      { key: "products", label: b.productsPage, rows: banners.filter((r) => r.placement === "products") },
    ];
    for (const c of categories) {
      const rows = banners.filter((r) => r.placement === "category" && r.categoryId === c.id);
      list.push({ key: `category:${c.id}`, label: fmt(b.categoryPage, { name: c.title }), rows });
    }
    return list;
  }, [banners, categories, b.productsPage, b.categoryPage]);

  function run(fn: () => Promise<void>, done?: string) {
    setError("");
    setNotice("");
    start(async () => {
      try {
        await fn();
        if (done) setNotice(done);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.common.somethingWrong);
      }
    });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!IMAGE_TYPES.includes(file.type)) return setError(b.imageType);
    if (file.size > 5 * 1024 * 1024) return setError(b.imageTooBig);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/field/media", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || b.imageFailed);
      setImageUrl(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : b.imageFailed);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function save() {
    if (!imageUrl) return setError(b.needImage);
    const [placement, cat] = where.split(":");
    run(async () => {
      await saveFieldBanner({
        imageUrl,
        placement: placement === "category" ? "category" : "products",
        categoryId: cat ? Number(cat) : null,
        productId: product?.id ?? null,
        title,
      });
      setImageUrl("");
      setTitle("");
      setProduct(null);
    }, b.saved);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title={b.title} description={b.subtitle} />
      {error ? <Notice tone="red">{error}</Notice> : null}
      {notice && !error ? <Notice>{notice}</Notice> : null}
      {!canEdit ? <Notice tone="red">{b.notAllowed}</Notice> : null}

      {canEdit ? (
        <form
          className="grid gap-4 rounded-2xl border border-[#1E3317]/10 bg-white p-5 shadow-sm lg:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h2 className="text-base font-bold text-[#1E3317] lg:col-span-2">{b.add}</h2>
          <div className="space-y-2">
            <span className={labelClass}>{b.upload}</span>
            <div className="flex flex-wrap items-center gap-3">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="aspect-[3/1] w-64 rounded-xl border border-[#1E3317]/10 object-cover" />
              ) : null}
              <input ref={fileInput} id="banner-image" type="file" accept={IMAGE_TYPES.join(",")} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
              <label htmlFor="banner-image" className={cn(buttonClass("secondary"), uploading && "pointer-events-none opacity-60")}>
                <ImagePlus aria-hidden /> {uploading ? b.uploading : b.upload}
              </label>
            </div>
            <p className="text-xs text-[#5E6B62]">{b.imageHelp}</p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="banner-where" className={labelClass}>{b.where}</label>
              <select id="banner-where" value={where} onChange={(e) => setWhere(e.target.value)} className={inputClass}>
                <option value="products">{b.productsPage}</option>
                {categories.map((c) => (
                  <option key={c.id} value={`category:${c.id}`}>
                    {fmt(b.categoryPage, { name: c.title })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="banner-title" className={labelClass}>{b.titleLabel}</label>
              <input id="banner-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputClass} />
            </div>
            <div>
              <label htmlFor="banner-product" className={labelClass}>{b.productLabel}</label>
              <ProductPicker
                id="banner-product"
                value={product}
                onChange={setProduct}
                text={{ placeholder: b.productPh, search: b.productSearch, none: b.productNone, pick: b.productPick, clear: b.productClear }}
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={pending || uploading || !imageUrl} className={buttonClass("primary")}>
                {pending ? b.saving : b.save}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="space-y-4">
        {pages
          .filter((page) => page.key === "products" || page.rows.length > 0)
          .map((page) => (
            <section key={page.key} className="rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#1E3317]/8 px-5 py-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-[#1E3317]">
                  <Images className="h-4 w-4" aria-hidden /> {page.label}
                </h2>
                <span className="text-xs text-[#5E6B62]">{fmt(b.count, { n: page.rows.length })}</span>
              </div>
              {page.rows.length === 0 ? (
                <p className="px-5 py-6 text-sm text-[#5E6B62]">{b.empty}</p>
              ) : (
                <ul className="divide-y divide-[#1E3317]/8">
                  {page.rows.map((row, i) => (
                    <li key={row.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.imageUrl} alt={row.title ?? ""} className={cn("aspect-[3/1] w-56 shrink-0 rounded-xl border border-[#1E3317]/10 object-cover", !row.active && "opacity-50")} />
                      <div className="min-w-0 flex-1 space-y-1 text-sm">
                        <p className="font-semibold text-[#1E3317]">{row.title || `#${row.id}`}</p>
                        {row.productName ? <p className="truncate text-xs text-[#5E6B62]">→ {row.productName}</p> : null}
                        <Badge tone={row.active ? "green" : "grey"}>{row.active ? b.shown : b.hidden}</Badge>
                      </div>
                      {canEdit ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" aria-label={b.moveUp} title={b.moveUp} disabled={pending || i === 0} className={buttonClass("secondary", "sm")} onClick={() => run(() => moveFieldBannerAction(row.id, "up"))}>
                            <ArrowUp aria-hidden />
                          </button>
                          <button type="button" aria-label={b.moveDown} title={b.moveDown} disabled={pending || i === page.rows.length - 1} className={buttonClass("secondary", "sm")} onClick={() => run(() => moveFieldBannerAction(row.id, "down"))}>
                            <ArrowDown aria-hidden />
                          </button>
                          <button type="button" disabled={pending} className={buttonClass("secondary", "sm")} onClick={() => run(() => setFieldBannerShown(row.id, !row.active))}>
                            {row.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {row.active ? b.hide : b.show}
                          </button>
                          {confirmId === row.id ? (
                            <>
                              <span className="text-xs font-medium text-[#8E3B34]">{b.removeConfirm}</span>
                              <button type="button" disabled={pending} className={buttonClass("danger", "sm")} onClick={() => run(async () => { await removeFieldBanner(row.id); setConfirmId(null); }, b.removed)}>
                                {b.remove}
                              </button>
                              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setConfirmId(null)}>
                                {t.common.cancel}
                              </button>
                            </>
                          ) : (
                            <button type="button" disabled={pending} className={buttonClass("danger", "sm")} onClick={() => setConfirmId(row.id)}>
                              <Trash2 aria-hidden /> {b.remove}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
      </div>
    </div>
  );
}
