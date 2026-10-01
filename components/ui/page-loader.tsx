import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Skywin brand mark with a progress ring rounding around it. Used for
 * route- and panel-level loading instead of a bare spinner.
 */
export function BrandLoader({
  size = 88,
  logoSize = 44,
  className,
}: {
  size?: number;
  logoSize?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 80 80"
        width={size}
        height={size}
        className="absolute inset-0 animate-spin"
        style={{ animationDuration: "1.1s" }}
      >
        <circle
          cx="40"
          cy="40"
          r="35"
          fill="none"
          strokeWidth="6"
          className="stroke-slate-200"
        />
        <circle
          cx="40"
          cy="40"
          r="35"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="150 70"
          className="stroke-emerald-600"
        />
      </svg>
      <img
        src="/logo.avif"
        alt=""
        width={logoSize}
        height={logoSize}
        className="absolute inset-0 m-auto rounded-full bg-white object-contain"
        style={{ width: logoSize, height: logoSize }}
        draggable={false}
      />
    </div>
  );
}

/** Centered brand loader for route `loading.tsx` files. */
export function PageLoader({
  label = "Loading…",
}: {
  /** Kept for call-site compat; all variants show the brand loader. */
  variant?: "default" | "table" | "dashboard" | "form";
  label?: string;
}) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <BrandLoader />
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

/** Centered block loader (dropdowns, panels) — brand mark, smaller. */
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
      <BrandLoader size={56} logoSize={28} />
      <span>{label}</span>
    </div>
  );
}
