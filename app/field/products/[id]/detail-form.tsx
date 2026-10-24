"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFieldProductDetail } from "@/lib/actions/field";
import type { FieldProductDetailInput } from "@/lib/queries/field-product-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePicker } from "./image-picker";

const area =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[#B8D94A]";

function ytThumb(url: string) {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : "";
}

export function ProductDetailForm({
  productId,
  productName,
  initial,
}: {
  productId: number;
  productName: string;
  initial: FieldProductDetailInput;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [f, setF] = useState(initial);
  const set = <K extends keyof FieldProductDetailInput>(k: K, v: FieldProductDetailInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const usage = f.usage.length ? f.usage : [];
  const updUsage = (i: number, k: keyof FieldProductDetailInput["usage"][number], v: string) =>
    set("usage", usage.map((u, j) => (j === i ? { ...u, [k]: v } : u)));
  const updVideo = (i: number, k: "title" | "url" | "thumbnail", v: string) =>
    set("videos", f.videos.map((u, j) => (j === i ? { ...u, [k]: v } : u)));

  const images = f.images;

  return (
    <form
      className="grid gap-5 xl:grid-cols-[1fr_360px]"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg("");
        start(async () => {
          try {
            await saveFieldProductDetail(productId, { ...f, images });
            setMsg("Saved. The Field app shows it the next time the page opens.");
            router.refresh();
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
    >
      <div className="space-y-5">
        <section className="space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-4">
          <h2 className="font-bold">Basics</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input
                value={f.displayName}
                placeholder={productName}
                onChange={(e) => set("displayName", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Available pack sizes</Label>
              <Input
                value={f.packSizes}
                placeholder="1L, 500ml, 250ml, 120ml"
                onChange={(e) => set("packSizes", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Active ingredient</Label>
            <Input
              value={f.activeIngredient}
              placeholder="Chlorantraniliprole 10% w/w + Novaluron 20% w/w SC"
              onChange={(e) => set("activeIngredient", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Images (the first one is the main photo in the app)</Label>
            <ImagePicker images={f.images} onChange={(next) => set("images", next)} />
          </div>
          <div className="space-y-1">
            <Label>&quot;For more details&quot; link (PDF or web page)</Label>
            <Input value={f.brochureUrl} onChange={(e) => set("brochureUrl", e.target.value)} />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-4">
          <h2 className="font-bold">Crop protection</h2>
          <div className="space-y-1">
            <Label>Headline</Label>
            <Input
              value={f.headline}
              placeholder="Delivers dual action for total crop protection."
              onChange={(e) => set("headline", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Description (blank line = new paragraph)</Label>
            <textarea rows={10} className={area} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Antidote</Label>
            <Input
              value={f.antidote}
              placeholder="No specific antidote known. Treat symptomatically"
              onChange={(e) => set("antidote", e.target.value)}
            />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Recommended usage</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set("usage", [...usage, { crop: "", pest: "", perHectare: "", perAcre: "" }])}
            >
              + Row
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_110px_110px_32px] gap-2 text-xs font-semibold uppercase text-[#2E4A22]/60">
            <span>Crop</span>
            <span>Insect / disease</span>
            <span>Per hectare</span>
            <span>Per acre</span>
            <span />
          </div>
          {usage.map((u, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_110px_110px_32px] gap-2">
              <Input value={u.crop} onChange={(e) => updUsage(i, "crop", e.target.value)} />
              <Input value={u.pest} onChange={(e) => updUsage(i, "pest", e.target.value)} />
              <Input value={u.perHectare} onChange={(e) => updUsage(i, "perHectare", e.target.value)} />
              <Input value={u.perAcre} onChange={(e) => updUsage(i, "perAcre", e.target.value)} />
              <button
                type="button"
                className="text-rose-600"
                onClick={() => set("usage", usage.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          {usage.length === 0 ? <p className="text-sm text-[#2E4A22]/60">No rows yet.</p> : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Related videos</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set("videos", [...f.videos, { title: "", url: "" }])}
            >
              + Video
            </Button>
          </div>
          {f.videos.map((v, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.4fr_32px] gap-2">
              <Input placeholder="Forabaz - Hindi" value={v.title} onChange={(e) => updVideo(i, "title", e.target.value)} />
              <Input placeholder="https://youtu.be/…" value={v.url} onChange={(e) => updVideo(i, "url", e.target.value)} />
              <button
                type="button"
                className="text-rose-600"
                onClick={() => set("videos", f.videos.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          {f.videos.length === 0 ? (
            <p className="text-sm text-[#2E4A22]/60">YouTube links get their thumbnail automatically.</p>
          ) : null}
        </section>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="bg-[#1E3317] text-white hover:bg-[#2E4A22]">
            {pending ? "Saving…" : "Save details"}
          </Button>
          {msg ? <p className="text-sm text-[#2E4A22]">{msg}</p> : null}
        </div>
      </div>

      <aside className="h-fit space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-4 xl:sticky xl:top-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#2E4A22]/50">App preview</p>
        <div className="overflow-hidden rounded-xl border border-[#1E3317]/10">
          <p className="bg-[#1E3317]/5 px-3 py-2 font-semibold">{f.displayName || productName}</p>
          {images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[0]} alt="" className="mx-auto h-40 object-contain p-2" />
          ) : (
            <div className="flex h-32 items-center justify-center text-xs text-[#2E4A22]/50">No image</div>
          )}
          <div className="space-y-2 p-3 text-xs">
            {f.activeIngredient ? (
              <p>
                <b>Active ingredient</b>
                <br />
                {f.activeIngredient}
              </p>
            ) : null}
            {f.packSizes ? (
              <p>
                <b>Pack sizes</b>
                <br />
                {f.packSizes}
              </p>
            ) : null}
            {f.headline ? <p className="font-semibold">{f.headline}</p> : null}
            {f.description ? <p className="line-clamp-4 text-[#2E4A22]/80">{f.description}</p> : null}
            {usage.length ? <p>{usage.length} usage rows</p> : null}
            {f.videos.length ? (
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
        </div>
      </aside>
    </form>
  );
}
