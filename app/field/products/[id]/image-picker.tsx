"use client";

import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { buttonClass, inputClass } from "@/components/field/kit";
import { useFieldText } from "@/components/field/lang";
import { cn } from "@/lib/utils";

const MAX_SIDE = 1600;

async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 700_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob ?? file;
}

export function ImagePicker({ images, onChange }: { images: string[]; onChange: (next: string[]) => void }) {
  const d = useFieldText().detail;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const added: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const blob = await shrink(file);
        const body = new FormData();
        body.append("file", blob, file.name.replace(/\.\w+$/, "") + (blob.type === "image/jpeg" ? ".jpg" : ""));
        const res = await fetch("/api/field/media", { method: "POST", body });
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error || d.uploadFailed);
        added.push(data.url);
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : d.uploadFailed}`);
      }
    }
    if (added.length) onChange([...images, ...added]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  const move = (from: number, to: number) => {
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {images.map((src, i) => (
          <div key={src + i} className={cn("relative w-36 overflow-hidden rounded-2xl border bg-white", i === 0 ? "border-[#3E5E2F] ring-2 ring-[#C6E26A]/60" : "border-[#1E3317]/15")}>
            {i === 0 ? (
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#1E3317] px-2 py-0.5 text-[10px] font-semibold text-white">
                <Star className="h-3 w-3 fill-[#C6E26A] text-[#C6E26A]" /> {d.main}
              </span>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-32 w-full object-contain p-2" />
            <div className="flex items-center justify-between border-t border-[#1E3317]/10 px-2 py-1.5 text-xs">
              {i === 0 ? (
                <span className="text-[#5E6B62]">#1</span>
              ) : (
                <button type="button" className="font-semibold text-[#245B3E] hover:underline" onClick={() => move(i, 0)}>
                  {d.makeMain}
                </button>
              )}
              <button
                type="button"
                aria-label={d.removeRow}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8E3B34] hover:bg-[#FBEAE8]"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex h-[170px] w-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#1E3317]/20 text-sm font-semibold text-[#3E5E2F] transition-colors hover:border-[#B8D94A] hover:bg-[#C6E26A]/10 disabled:opacity-50"
        >
          <ImagePlus className="h-6 w-6" />
          {busy ? d.uploading : d.addImage}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      {error ? <p className="text-sm font-medium text-[#8E3B34]">{error}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={url} placeholder={d.pasteLink} onChange={(e) => setUrl(e.target.value)} className={cn(inputClass, "sm:max-w-md")} />
        <button
          type="button"
          className={buttonClass("secondary")}
          disabled={!/^https?:\/\//.test(url.trim())}
          onClick={() => {
            onChange([...images, url.trim()]);
            setUrl("");
          }}
        >
          {d.addLink}
        </button>
      </div>
    </div>
  );
}
