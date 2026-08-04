import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Full-page skeleton shown by route `loading.tsx` files while server data loads. */
export function PageLoader({
  variant = "default",
}: {
  variant?: "default" | "table" | "dashboard" | "form";
}) {
  if (variant === "dashboard") {
    return (
      <div className="animate-pulse space-y-6 p-6" role="status" aria-label="Loading">
        <div className="h-8 w-48 rounded-lg bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-200" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-72 rounded-xl bg-slate-200 lg:col-span-2" />
          <div className="h-72 rounded-xl bg-slate-200" />
        </div>
        <span className="sr-only">Loading dashboard…</span>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className="animate-pulse space-y-6 p-6" role="status" aria-label="Loading">
        <div className="h-8 w-40 rounded-lg bg-slate-200" />
        <div className="h-4 w-64 rounded bg-slate-100" />
        <div className="space-y-3 rounded-xl border border-slate-100 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100" />
          ))}
        </div>
        <span className="sr-only">Loading form…</span>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="animate-pulse space-y-6 p-6" role="status" aria-label="Loading">
        <div className="flex items-center justify-between gap-4">
          <div className="h-8 w-36 rounded-lg bg-slate-200" />
          <div className="h-9 w-28 rounded-lg bg-slate-200" />
        </div>
        <div className="h-10 rounded-lg bg-slate-200" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-100" />
          ))}
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <div className="animate-pulse space-y-6 p-6" role="status" aria-label="Loading">
      <div className="h-8 w-48 rounded-lg bg-slate-200" />
      <div className="h-4 w-72 rounded bg-slate-100" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-xl bg-slate-200" />
        <div className="h-64 rounded-xl bg-slate-200" />
      </div>
      <span className="sr-only">Loading…</span>
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
