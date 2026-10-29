"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveFieldProductDetail } from "@/lib/actions/field";
import type { FieldProductDetailInput } from "@/lib/queries/field-product-details";
import { fieldDetailGaps, fieldDetailHasPhoto, httpUrlError } from "@/lib/field-product-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePicker } from "./image-picker";

const area =
  "mt-1 w-full rounded-md border border-[#1E3317]/15 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1E3317]";
const fieldClass = "mt-1 h-9 rounded-md border-[#1E3317]/15 text-sm focus-visible:ring-[#1E3317]";
const primaryButton = "bg-[#1E3317] text-white hover:bg-[#245B3E]";

function ytThumb(url: string) {
  const match = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : "";
}

export function ProductDetailForm({
  productId,
  productName,
  sku,
  placement,
  updatedAt,
  initial,
}: {
  productId: number;
  productName: string;
  sku: string | null;
  placement: { category: string; categorySlug: string; sub: string } | null;
  updatedAt: string | null;
  initial: FieldProductDetailInput;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [brochureError, setBrochureError] = useState("");
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
    const nextBrochure = httpUrlError(f.brochureUrl);
    const nextVideo = f.videos.some((video) => httpUrlError(video.url))
      ? "Each video link must start with http:// or https://."
      : "";
    setBrochureError(nextBrochure);
    setVideoError(nextVideo);
    if (nextBrochure || nextVideo) return;
    setError("");
    setSaved(false);
    start(async () => {
      try {
        await saveFieldProductDetail(productId, f);
        setBaseline(JSON.stringify(f));
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save product details");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {discard ? (
            <div role="alert" className="mb-3 rounded-md border border-[#1E3317]/15 bg-white px-3 py-3">
              <p className="text-sm text-[#1E3317]">Discard unsaved changes?</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="destructive" size="sm" onClick={() => router.push("/field/products")}>
                  Discard
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setDiscard(false)}>
                  Keep editing
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (dirty ? setDiscard(true) : router.push("/field/products"))}
              className="text-xs font-medium text-[#245B3E] hover:underline"
            >
              Product details
            </button>
          )}
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#1E3317]">{productName}</h1>
          <p className="mt-1 text-sm text-[#5E6B62]">
            {sku || `ID ${productId}`}
            {updatedAt
              ? ` · saved ${new Date(updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
              : " · no farmer details saved yet"}
          </p>
        </div>
      </div>

      <form
        className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="space-y-4">
          <section className="rounded-lg border border-[#1E3317]/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-[#1E3317]">Billing product</h2>
            <p className="mt-1 text-xs text-[#5E6B62]">Name, SKU, and price stay with billing inventory. This page does not change them.</p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[#5E6B62]">Name</dt>
                <dd className="mt-1 break-words font-medium text-[#1E3317]">{productName}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5E6B62]">SKU</dt>
                <dd className="mt-1 font-medium text-[#1E3317]">{sku || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#5E6B62]">Product ID</dt>
                <dd className="mt-1 font-medium tabular-nums text-[#1E3317]">{productId}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-[#1E3317]/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-[#1E3317]">Catalog</h2>
            {placement ? (
              <p className="mt-1 text-sm text-[#29332C]">
                <Link href={`/field/catalog/${placement.categorySlug}`} className="font-medium text-[#245B3E] hover:underline">
                  {placement.category}
                </Link>
                <span className="text-[#5E6B62]"> · {placement.sub}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#5E6B62]">
                Not in the catalogue.{" "}
                <Link href="/field/catalog" className="font-medium text-[#245B3E] hover:underline">
                  Pin it from Catalog
                </Link>
                .
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-[#1E3317]/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-[#1E3317]">Farmer-facing information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={f.displayName}
                  placeholder={productName}
                  onChange={(event) => set("displayName", event.target.value)}
                  aria-describedby="display-name-help"
                  className={fieldClass}
                />
                <p id="display-name-help" className="mt-1 text-xs text-[#5E6B62]">
                  Optional. The billing name is used when this is blank.
                </p>
              </div>
              <div>
                <Label htmlFor="packs">Pack sizes</Label>
                <Input
                  id="packs"
                  value={f.packSizes}
                  placeholder="1L, 500ml, 250ml"
                  onChange={(event) => set("packSizes", event.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ingredient">Active ingredient</Label>
              <Input
                id="ingredient"
                value={f.activeIngredient}
                onChange={(event) => set("activeIngredient", event.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <Label>Photos</Label>
              <p className="mt-1 text-xs text-[#5E6B62]">The first photo is the one shown in the app.</p>
              <div className="mt-2">
                <ImagePicker images={f.images} onChange={(next) => set("images", next)} />
              </div>
            </div>
            <div>
              <Label htmlFor="brochure">Brochure link</Label>
              <Input
                id="brochure"
                value={f.brochureUrl}
                onChange={(event) => {
                  set("brochureUrl", event.target.value);
                  if (brochureError) setBrochureError("");
                }}
                aria-invalid={brochureError ? true : undefined}
                aria-describedby={brochureError ? "brochure-error" : undefined}
                className={fieldClass}
              />
              {brochureError ? (
                <p id="brochure-error" className="mt-1 text-xs text-[#8E3B34]">
                  {brochureError}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="headline">Headline</Label>
              <Input id="headline" value={f.headline} onChange={(event) => set("headline", event.target.value)} className={fieldClass} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                rows={8}
                className={area}
                value={f.description}
                onChange={(event) => set("description", event.target.value)}
                aria-describedby="description-help"
              />
              <p id="description-help" className="mt-1 text-xs text-[#5E6B62]">
                A blank line starts a new paragraph in the app.
              </p>
            </div>
            <div>
              <Label htmlFor="antidote">Antidote</Label>
              <Input id="antidote" value={f.antidote} onChange={(event) => set("antidote", event.target.value)} className={fieldClass} />
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-[#1E3317]/10 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#1E3317]">Recommended usage</h2>
              <button
                type="button"
                className="text-xs font-medium text-[#245B3E] hover:underline"
                onClick={() => set("usage", [...f.usage, { crop: "", pest: "", perHectare: "", perAcre: "" }])}
              >
                Add row
              </button>
            </div>
            {f.usage.length === 0 ? <p className="text-xs text-[#5E6B62]">No usage rows yet.</p> : null}
            {f.usage.map((row, index) => (
              <div key={index} className="grid gap-2 rounded-md border border-[#1E3317]/10 p-3 sm:grid-cols-2">
                <Field label="Crop" value={row.crop} onChange={(value) => updateUsage(index, "crop", value)} />
                <Field label="Insect or disease" value={row.pest} onChange={(value) => updateUsage(index, "pest", value)} />
                <Field label="Per hectare" value={row.perHectare} onChange={(value) => updateUsage(index, "perHectare", value)} />
                <Field label="Per acre" value={row.perAcre} onChange={(value) => updateUsage(index, "perAcre", value)} />
                <button
                  type="button"
                  className="text-left text-xs font-medium text-[#8E3B34] hover:underline"
                  onClick={() => set("usage", f.usage.filter((_, rowIndex) => rowIndex !== index))}
                >
                  Remove row
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded-lg border border-[#1E3317]/10 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#1E3317]">Videos</h2>
              <button
                type="button"
                className="text-xs font-medium text-[#245B3E] hover:underline"
                onClick={() => set("videos", [...f.videos, { title: "", url: "" }])}
              >
                Add video
              </button>
            </div>
            {videoError ? <p className="text-xs text-[#8E3B34]">{videoError}</p> : null}
            {f.videos.length === 0 ? (
              <p className="text-xs text-[#5E6B62]">YouTube links pick up a thumbnail in the app.</p>
            ) : null}
            {f.videos.map((video, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <Input
                  aria-label="Video title"
                  value={video.title}
                  placeholder="Title"
                  onChange={(event) => updateVideo(index, "title", event.target.value)}
                  className={fieldClass}
                />
                <Input
                  aria-label="Video link"
                  value={video.url}
                  placeholder="https://youtu.be/…"
                  onChange={(event) => updateVideo(index, "url", event.target.value)}
                  className={fieldClass}
                />
                <button
                  type="button"
                  className="text-xs font-medium text-[#8E3B34] hover:underline"
                  onClick={() => set("videos", f.videos.filter((_, rowIndex) => rowIndex !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          {error ? (
            <p role="alert" className="text-sm text-[#8E3B34]">
              {error} Your edits are still here.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending} className={saved && !dirty ? "bg-[#245B3E] hover:bg-[#245B3E]" : primaryButton}>
              {pending ? "Saving…" : saved && !dirty ? "Saved" : "Save details"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => (dirty ? setDiscard(true) : router.push("/field/products"))}>
              Cancel
            </Button>
          </div>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-4">
          <section className="rounded-lg border border-[#1E3317]/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-[#1E3317]">{gaps.length ? "Needs details" : "Complete"}</h2>
            {gaps.length ? (
              <ul className="mt-2 space-y-1 text-xs text-[#5E6B62]">
                {gaps.map((gap) => (
                  <li key={gap}>Missing {gap}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[#5E6B62]">Description and crop information are present.</p>
            )}
            {hasPhoto ? null : <p className="mt-2 text-xs text-[#5E6B62]">No photo yet. The written details still show in the app.</p>}
            <p className="mt-3 text-xs leading-5 text-[#5E6B62]">
              Pack sizes, headline, antidote, brochure, and videos stay optional.
            </p>
          </section>
          <section className="rounded-lg border border-[#1E3317]/10 bg-white p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#5E6B62]">App preview</h2>
            <p className="mt-2 font-medium text-[#1E3317]">{f.displayName || productName}</p>
            {f.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.images[0]} alt="" className="mt-2 h-36 w-full object-contain" />
            ) : (
              <p className="mt-3 text-xs text-[#5E6B62]">No photo</p>
            )}
            {f.activeIngredient ? <p className="mt-2 text-xs text-[#29332C]">{f.activeIngredient}</p> : null}
            {f.headline ? <p className="mt-2 text-xs font-medium text-[#1E3317]">{f.headline}</p> : null}
            {f.description ? <p className="mt-2 line-clamp-4 text-xs text-[#5E6B62]">{f.description}</p> : null}
            {f.videos.some((video) => ytThumb(video.url)) ? (
              <div className="mt-2 grid grid-cols-3 gap-1">
                {f.videos.map((video, index) =>
                  ytThumb(video.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={index} src={ytThumb(video.url)} alt="" className="aspect-video w-full rounded object-cover" />
                  ) : null
                )}
              </div>
            ) : null}
          </section>
        </aside>
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
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </div>
  );
}
