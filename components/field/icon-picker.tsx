"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/field/kit";
import { useFieldText } from "@/components/field/lang";
import { cn } from "@/lib/utils";

const ICON_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ICON_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Shows a category or subcategory icon with Upload / Remove. The image goes to /api/field/media,
 * then `onSave` stores its address. The app shows it the next time it loads the catalogue.
 */
export function IconPicker({
  label,
  iconUri,
  fallback,
  onSave,
  size = "md",
}: {
  label: string;
  iconUri: string | null;
  fallback: string;
  onSave: (uri: string | null) => Promise<void>;
  size?: "sm" | "md";
}) {
  const t = useFieldText();
  const c = t.catalog;
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!ICON_TYPES.includes(file.type)) {
      setError(c.iconType);
      return;
    }
    if (file.size > ICON_MAX_BYTES) {
      setError(c.iconTooBig);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/field/media", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || c.iconFailed);
      await onSave(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.iconFailed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setError("");
    setBusy(true);
    try {
      await onSave(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.iconFailed);
    } finally {
      setBusy(false);
    }
  }

  const box = size === "sm" ? "h-10 w-10 rounded-lg" : "h-14 w-14 rounded-xl";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-[#1E3317]/10 bg-[#EDF2E7] font-bold text-[#3E5E2F]", box)}>
        {iconUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUri} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <span aria-hidden>{fallback.trim().charAt(0).toUpperCase() || "•"}</span>
        )}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} id={inputId} type="file" accept={ICON_TYPES.join(",")} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
        <label htmlFor={inputId} className={cn(buttonClass("secondary", "sm"), busy && "pointer-events-none opacity-60")} aria-label={`${iconUri ? c.iconChange : c.iconUpload}: ${label}`}>
          <ImagePlus aria-hidden /> {busy ? t.common.saving : iconUri ? c.iconChange : c.iconUpload}
        </label>
        {iconUri ? (
          <button type="button" onClick={() => void remove()} disabled={busy} className={buttonClass("ghost", "sm")} aria-label={`${c.iconRemove}: ${label}`}>
            <Trash2 aria-hidden /> {c.iconRemove}
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="w-full text-xs font-medium text-[#8E3B34]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
