import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centered circular spinner for route `loading.tsx` files. */
export function PageLoader({
  label = "Loading…",
}: {
  /** Kept for call-site compat; all variants show the circle spinner. */
  variant?: "default" | "table" | "dashboard" | "form";
  label?: string;
}) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
      <p className="text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}

/** Compact spinner for search / inline fetches. */
export function InlineLoader({
  className,
  label = "Loading…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-slate-500", className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
      <span>{label}</span>
    </span>
  );
}

/** Centered block spinner (dropdowns, panels). */
export function BlockLoader({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      <span>{label}</span>
    </div>
  );
}
