"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
        if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
        added.push(data.url);
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`);
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
          <div key={src + i} className="w-32 overflow-hidden rounded-xl border border-[#1E3317]/15 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-28 w-full object-contain p-1" />
            <div className="flex items-center justify-between border-t border-[#1E3317]/10 px-2 py-1 text-xs">
              {i === 0 ? (
                <span className="font-semibold text-[#2E4A22]">Main</span>
              ) : (
                <button type="button" className="font-semibold text-[#2E4A22] hover:underline" onClick={() => move(i, 0)}>
                  Make main
                </button>
              )}
              <button
                type="button"
                className="text-rose-600 hover:underline"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex h-[150px] w-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#1E3317]/25 text-sm font-semibold text-[#2E4A22] hover:border-[#B8D94A] hover:bg-[#B8D94A]/10 disabled:opacity-50"
        >
          <span className="text-2xl leading-none">+</span>
          {busy ? "Uploading…" : "Add image"}
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
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="flex gap-2">
        <Input
          value={url}
          placeholder="…or paste an image link"
          onChange={(e) => setUrl(e.target.value)}
          className="max-w-md"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!/^https?:\/\//.test(url.trim())}
          onClick={() => {
            onChange([...images, url.trim()]);
            setUrl("");
          }}
        >
          Add link
        </Button>
      </div>
    </div>
  );
}
