"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveFieldProductDetail } from "@/lib/actions/field";
import type { FieldProductDetailInput } from "@/lib/queries/field-product-details";
import { fieldDetailGaps, fieldDetailHasPhoto, formatGst, formatInr, formatQty, httpUrlError, orderQtyPairError } from "@/lib/field-product-rules";
import { CheckCircle2, CircleAlert, ImageOff, Plus, Smartphone, Trash2 } from "lucide-react";
import { ImagePicker } from "./image-picker";
import { Badge, Notice, PageHeader, buttonClass, inputClass, labelClass } from "@/components/field/kit";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

const area = cn(inputClass, "h-auto py-2.5 leading-6");
const fieldClass = inputClass;
function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={labelClass}>
      {children}
    </label>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}

function ytThumb(url: string) {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : "";
}

export function ProductDetailForm({
  productId,
  productName,
  sku,
  mrp,
  gstRate,
  hsnCode,
  stockQty,
  placement,
  updatedAt,
  initial,
}: {
  productId: number;
  productName: string;
  sku: string | null;
  mrp: string | null;
  gstRate: string;
  hsnCode: string | null;
  stockQty: string;
  placement: { category: string; categorySlug: string; sub: string } | null;
  updatedAt: string | null;
  initial: FieldProductDetailInput;
}) {
  const router = useRouter();
  const t = useFieldText();
  const d = t.detail;
  const locale = fieldLocale(useFieldLang());
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [brochureError, setBrochureError] = useState("");
  const [qtyError, setQtyError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [f, setF] = useState(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const snapshot = JSON.stringify(f);
  const dirty = snapshot !== baseline;
  const set = <K extends keyof FieldProductDetailInput>(key: K, value: FieldProductDetailInput[K]) =>
    setF((current) => ({ ...current, [key]: value }));
  const gaps = fieldDetailGaps({
    description: f.description,
    activeIngredient: f.activeIngredient,
    usage: f.usage,
  });
  const hasPhoto = fieldDetailHasPhoto(f.images);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function submit() {
    const nextBrochure = httpUrlError(f.brochureUrl) ? d.linkError : "";
    const qtyProblem = orderQtyPairError(f.minOrderQty, f.maxOrderQty);
    const nextQty = qtyProblem === "Minimum order quantity cannot be higher than the maximum." ? d.qtyOrderError : qtyProblem;
    const nextVideo = f.videos.some((video) => httpUrlError(video.url)) ? d.videoError : "";
    setBrochureError(nextBrochure);
    setQtyError(nextQty);
    setVideoError(nextVideo);
    if (nextBrochure || nextQty || nextVideo) return;
    setError("");
    setSaved(false);
    start(async () => {
      try {
        await saveFieldProductDetail(productId, f);
        setBaseline(JSON.stringify(f));
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : d.saveFailed);
      }
    });
  }

  const gapName = (gap: string) => (gap === "description" ? t.products.gapDescription : gap === "ingredient or usage" ? t.products.gapUsage : gap);
  const leave = () => (dirty ? setDiscard(true) : router.push("/field/products"));
  const section = "space-y-4 rounded-2xl border border-[#1E3317]/10 bg-white p-5 shadow-sm";
  const h2 = "text-base font-bold text-[#1E3317]";

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24">
      <div>
        <button type="button" onClick={leave} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#245B3E] hover:underline">
          <span aria-hidden>←</span> {d.back}
        </button>
        <PageHeader
          title={f.displayName || productName}
          description={
            <>
              <span className="font-mono">{sku || `ID ${productId}`}</span>
              {" · "}
              {updatedAt
                ? fmt(d.savedAt, { date: new Date(updatedAt).toLocaleString(locale, { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) })
                : d.notSaved}
            </>
          }
          actions={gaps.length ? <Badge tone="amber">{d.needsDetails}</Badge> : <Badge tone="green">{d.complete}</Badge>}
        />
      </div>

      {discard ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#8A5A00]/20 bg-[#FFF8EB] px-5 py-4">
          <p className="text-sm font-medium text-[#1E3317]">{d.discardQ}</p>
          <div className="flex gap-2">
            <button type="button" className={buttonClass("danger", "sm")} onClick={() => router.push("/field/products")}>
              {d.discard}
            </button>
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setDiscard(false)}>
              {d.keepEditing}
            </button>
          </div>
        </div>
      ) : null}

      <form
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="min-w-0 space-y-6">
          <section className={section}>
            <div>
              <h2 className={h2}>{d.billing}</h2>
              <p className="mt-1 text-xs text-[#5E6B62]">{d.billingHelp}</p>
            </div>
            <dl className="grid grid-cols-2 gap-4 rounded-xl bg-[#FAFBF7] p-4 text-sm sm:grid-cols-3">
              <Info label={d.name} wide>{productName}</Info>
              <Info label={d.sku}>
                <span className="font-mono">{sku || "—"}</span>
              </Info>
              <Info label={d.mrp}>{formatInr(mrp)}</Info>
              <Info label={d.gst}>{formatGst(gstRate)}</Info>
              <Info label={d.hsn}>
                <span className="font-mono">{hsnCode?.trim() || "—"}</span>
              </Info>
              <Info label={d.stock}>{formatQty(stockQty)}</Info>
            </dl>
            <p className="text-sm text-[#29332C]">
              <span className="text-xs font-semibold text-[#5E6B62]">{d.catalog}: </span>
              {placement ? (
                <Link href={`/field/catalog/${placement.categorySlug}`} className="font-semibold text-[#245B3E] hover:underline">
                  {placement.category} › {placement.sub}
                </Link>
              ) : (
                <>
                  {d.notInCatalogue}{" "}
                  <Link href="/field/catalog" className="font-semibold text-[#245B3E] hover:underline">
                    {d.pinFromCatalog}
                  </Link>
                </>
              )}
            </p>
          </section>

          <section className={section}>
            <h2 className={h2}>{d.farmerInfo}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="display-name">{d.displayName}</Label>
                <Input id="display-name" value={f.displayName} placeholder={productName} onChange={(e) => set("displayName", e.target.value)} aria-describedby="display-name-help" className={fieldClass} />
                <p id="display-name-help" className="mt-1 text-xs text-[#5E6B62]">{d.displayHelp}</p>
              </div>
              <div>
                <Label htmlFor="brand">{d.brand}</Label>
                <Input id="brand" value={f.brand} placeholder={d.brandPh} onChange={(e) => set("brand", e.target.value)} className={fieldClass} />
              </div>
              <div>
                <Label htmlFor="ingredient">{d.ingredient}</Label>
                <Input id="ingredient" value={f.activeIngredient} onChange={(e) => set("activeIngredient", e.target.value)} className={fieldClass} />
              </div>
              <div>
                <Label htmlFor="packs">{d.packs}</Label>
                <Input id="packs" value={f.packSizes} placeholder="1L, 500ml, 250ml" onChange={(e) => set("packSizes", e.target.value)} className={fieldClass} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="crops">{d.crops}</Label>
                <Input id="crops" value={f.crops} placeholder={d.cropsPh} onChange={(e) => set("crops", e.target.value)} aria-describedby="crops-help" className={fieldClass} />
                <p id="crops-help" className="mt-1 text-xs text-[#5E6B62]">{d.cropsHelp}</p>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="headline">{d.headline}</Label>
                <Input id="headline" value={f.headline} onChange={(e) => set("headline", e.target.value)} className={fieldClass} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">{d.description}</Label>
                <textarea id="description" rows={7} className={area} value={f.description} onChange={(e) => set("description", e.target.value)} aria-describedby="description-help" />
                <p id="description-help" className="mt-1 text-xs text-[#5E6B62]">{d.descriptionHelp}</p>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="instructions">{d.instructions}</Label>
                <textarea id="instructions" rows={4} className={area} value={f.instructions} onChange={(e) => set("instructions", e.target.value)} aria-describedby="instructions-help" placeholder={d.instructionsPh} />
                <p id="instructions-help" className="mt-1 text-xs text-[#5E6B62]">{d.instructionsHelp}</p>
              </div>
              <div>
                <Label htmlFor="min-qty">{d.minQty}</Label>
                <Input
                  id="min-qty"
                  inputMode="decimal"
                  value={f.minOrderQty}
                  placeholder={d.noMin}
                  onChange={(e) => {
                    set("minOrderQty", e.target.value);
                    if (qtyError) setQtyError("");
                  }}
                  aria-invalid={qtyError ? true : undefined}
                  aria-describedby={qtyError ? "qty-error" : "min-qty-help"}
                  className={fieldClass}
                />
                <p id="min-qty-help" className="mt-1 text-xs text-[#5E6B62]">{d.qtyHelp}</p>
              </div>
              <div>
                <Label htmlFor="max-qty">{d.maxQty}</Label>
                <Input
                  id="max-qty"
                  inputMode="decimal"
                  value={f.maxOrderQty}
                  placeholder={d.noMax}
                  onChange={(e) => {
                    set("maxOrderQty", e.target.value);
                    if (qtyError) setQtyError("");
                  }}
                  aria-invalid={qtyError ? true : undefined}
                  className={fieldClass}
                />
              </div>
              {qtyError ? (
                <p id="qty-error" className="text-xs font-medium text-[#8E3B34] sm:col-span-2">
                  {qtyError}
                </p>
              ) : null}
              <div>
                <Label htmlFor="antidote">{d.antidote}</Label>
                <Input id="antidote" value={f.antidote} onChange={(e) => set("antidote", e.target.value)} className={fieldClass} />
              </div>
              <div>
                <Label htmlFor="brochure">{d.brochure}</Label>
                <Input
                  id="brochure"
                  value={f.brochureUrl}
                  placeholder="https://"
                  onChange={(e) => {
                    set("brochureUrl", e.target.value);
                    if (brochureError) setBrochureError("");
                  }}
                  aria-invalid={brochureError ? true : undefined}
                  aria-describedby={brochureError ? "brochure-error" : undefined}
                  className={fieldClass}
                />
                {brochureError ? (
                  <p id="brochure-error" className="mt-1 text-xs font-medium text-[#8E3B34]">
                    {brochureError}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className={section}>
            <div>
              <h2 className={h2}>{d.photos}</h2>
              <p className="mt-1 text-xs text-[#5E6B62]">{d.photosHelp}</p>
            </div>
            <ImagePicker images={f.images} onChange={(next) => set("images", next)} />
          </section>

          <section className={section}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className={h2}>{d.usageTitle}</h2>
                <p className="mt-1 text-xs text-[#5E6B62]">{d.usageHelp}</p>
              </div>
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => set("usage", [...f.usage, { crop: "", pest: "", perHectare: "", perAcre: "" }])}>
                <Plus aria-hidden /> {d.addRow}
              </button>
            </div>
            {f.usage.length === 0 ? <p className="rounded-xl bg-[#FAFBF7] px-4 py-6 text-center text-sm text-[#5E6B62]">{d.noUsage}</p> : null}
            <div className="space-y-3">
              {f.usage.map((row, index) => (
                <div key={index} className="grid gap-3 rounded-xl border border-[#1E3317]/10 bg-[#FAFBF7] p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr_0.8fr_auto] lg:items-end">
                  <Field label={d.crop} value={row.crop} onChange={(v) => updateUsage(index, "crop", v)} />
                  <Field label={d.pest} value={row.pest} onChange={(v) => updateUsage(index, "pest", v)} />
                  <Field label={d.perHectare} value={row.perHectare} onChange={(v) => updateUsage(index, "perHectare", v)} />
                  <Field label={d.perAcre} value={row.perAcre} onChange={(v) => updateUsage(index, "perAcre", v)} />
                  <button
                    type="button"
                    aria-label={d.removeRow}
                    title={d.removeRow}
                    className={cn(buttonClass("danger", "sm"), "h-10")}
                    onClick={() => set("usage", f.usage.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden />
                    <span className="lg:sr-only">{d.removeRow}</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={section}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className={h2}>{d.videos}</h2>
                <p className="mt-1 text-xs text-[#5E6B62]">{d.videosHelp}</p>
              </div>
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => set("videos", [...f.videos, { title: "", url: "" }])}>
                <Plus aria-hidden /> {d.addVideo}
              </button>
            </div>
            {videoError ? <Notice tone="red">{videoError}</Notice> : null}
            {f.videos.map((video, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <Input aria-label={d.videoTitle} value={video.title} placeholder={d.videoTitle} onChange={(e) => updateVideo(index, "title", e.target.value)} className={fieldClass} />
                <Input aria-label={d.videoLink} value={video.url} placeholder="https://youtu.be/…" onChange={(e) => updateVideo(index, "url", e.target.value)} className={fieldClass} />
                <button type="button" aria-label={t.common.remove} className={cn(buttonClass("danger", "sm"), "h-10")} onClick={() => set("videos", f.videos.filter((_, i) => i !== index))}>
                  <Trash2 aria-hidden />
                </button>
              </div>
            ))}
          </section>

          {error ? (
            <Notice tone="red">
              {error} {d.keptEdits}
            </Notice>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <section className="rounded-2xl border border-[#1E3317]/10 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              {gaps.length ? <CircleAlert className="h-5 w-5 text-[#8A5A00]" /> : <CheckCircle2 className="h-5 w-5 text-[#245B3E]" />}
              <h2 className="text-sm font-bold text-[#1E3317]">{gaps.length ? d.needsDetails : d.complete}</h2>
            </div>
            {gaps.length ? (
              <ul className="mt-2 space-y-1 text-sm text-[#8A5A00]">
                {gaps.map((gap) => (
                  <li key={gap}>• {fmt(d.missing, { gap: gapName(gap) })}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[#5E6B62]">{d.completeBody}</p>
            )}
            {hasPhoto ? null : <p className="mt-2 text-xs text-[#5E6B62]">{d.noPhotoNote}</p>}
            <p className="mt-3 border-t border-[#1E3317]/8 pt-3 text-xs leading-5 text-[#5E6B62]">{d.optionalNote}</p>
          </section>

          <section className="overflow-hidden rounded-[28px] border-[6px] border-[#1E3317] bg-[#F4F5EF] shadow-lg">
            <div className="flex items-center gap-1.5 bg-[#1E3317] px-3 pb-1.5 text-[11px] font-semibold text-white/80">
              <Smartphone className="h-3.5 w-3.5" /> {d.preview}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-white">
                {f.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.images[0]} alt="" className="h-full w-full object-contain p-2" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-xs text-[#5E6B62]">
                    <ImageOff className="h-5 w-5" />
                    {d.noPhoto}
                  </span>
                )}
              </div>
              <p className="text-[15px] font-bold leading-5 text-[#1E3317]">{f.displayName || productName}</p>
              {f.brand ? <p className="text-xs text-[#5E6B62]">{f.brand}</p> : null}
              <p className="text-base font-bold text-[#1E3317]">{formatInr(mrp)}</p>
              {f.headline ? <p className="text-xs font-semibold text-[#245B3E]">{f.headline}</p> : null}
              {f.activeIngredient ? <p className="text-xs text-[#29332C]">{f.activeIngredient}</p> : null}
              {f.description ? <p className="line-clamp-4 text-xs leading-5 text-[#5E6B62]">{f.description}</p> : null}
              {f.crops ? (
                <div className="flex flex-wrap gap-1">
                  {f.crops
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean)
                    .slice(0, 6)
                    .map((c) => (
                      <span key={c} className="rounded-full bg-[#E4ECD9] px-2 py-0.5 text-[10px] font-medium text-[#3E5E2F]">
                        {c}
                      </span>
                    ))}
                </div>
              ) : null}
              {f.videos.some((v) => ytThumb(v.url)) ? (
                <div className="grid grid-cols-3 gap-1">
                  {f.videos.map((v, i) =>
                    ytThumb(v.url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={ytThumb(v.url)} alt="" className="aspect-video w-full rounded object-cover" />
                    ) : null
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </aside>

        {/* Sticky save bar */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#1E3317]/10 bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(30,51,23,0.08)] backdrop-blur md:left-[76px] lg:left-64">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
            {dirty ? <span className="mr-auto text-xs font-semibold text-[#8A5A00]">● {d.unsaved}</span> : null}
            <button type="button" className={buttonClass("secondary")} disabled={pending} onClick={leave}>
              {t.common.cancel}
            </button>
            <button type="submit" disabled={pending} className={buttonClass(saved && !dirty ? "lime" : "primary")}>
              {pending ? t.common.saving : saved && !dirty ? t.common.saved : d.saveDetails}
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  function updateUsage(index: number, key: keyof FieldProductDetailInput["usage"][number], value: string) {
    set(
      "usage",
      f.usage.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    );
  }

  function updateVideo(index: number, key: "title" | "url" | "thumbnail", value: string) {
    set(
      "videos",
      f.videos.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    );
    if (videoError) setVideoError("");
  }
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </label>
  );
}

function Info({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : undefined}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#5E6B62]">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold tabular-nums text-[#1E3317]">{children}</dd>
    </div>
  );
}
