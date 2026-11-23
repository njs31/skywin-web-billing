"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DELIVERY_STEPS, STEP_SHORT, stepIndex, type Tone } from "@/lib/order-status";

/* Shared pieces for the Orders and Shipping & Dispatch pages: one quiet slate + emerald system. */

export function buttonClass(kind: "primary" | "secondary" | "ghost" | "danger" = "secondary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 focus-visible:ring-offset-1",
    "disabled:pointer-events-none disabled:opacity-45",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
    kind === "primary" && "bg-emerald-700 text-white hover:bg-emerald-800",
    kind === "secondary" && "border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
    kind === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    kind === "danger" && "border border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50"
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 " +
  "focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/15 disabled:bg-slate-50";

export const labelClass = "mb-1 block text-[13px] font-medium text-slate-700";

const TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  amber: "bg-amber-50 text-amber-800",
  blue: "bg-sky-50 text-sky-800",
  green: "bg-emerald-50 text-emerald-800",
  red: "bg-rose-50 text-rose-700",
};
const DOT: Record<Tone, string> = {
  neutral: "bg-slate-400",
  amber: "bg-amber-500",
  blue: "bg-sky-500",
  green: "bg-emerald-600",
  red: "bg-rose-500",
};

export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", TONE[tone], className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
    </div>
  );
}

/** A row of figures in one bordered strip (two columns on phones). */
export function Figures({ items }: { items: Array<{ label: string; value: string; sub?: string }> }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn(
            "px-4 py-3.5 sm:px-5",
            i % 2 === 1 && "border-l border-slate-200",
            i >= 2 && "border-t border-slate-200 lg:border-t-0",
            i === 2 && "lg:border-l"
          )}
        >
          <dt className="text-[13px] text-slate-500">{item.label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-slate-900">{item.value}</dd>
          {item.sub ? <dd className="mt-0.5 text-xs tabular-nums text-slate-500">{item.sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{placeholder}</span>
      <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400">
        <path fill="currentColor" d="M8.5 3a5.5 5.5 0 0 1 4.383 8.823l3.647 3.647a.75.75 0 1 1-1.06 1.06l-3.647-3.646A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "pl-9")}
      />
    </label>
  );
}

/** Underlined filter tabs with counts; scrolls sideways on phones. */
export function FilterTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: Array<{ key: K; label: string; count?: number }>;
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" aria-label={label} className="flex min-w-max gap-5 border-b border-slate-200">
        {tabs.map((t) => {
          const on = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.key)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm transition-colors focus-visible:outline-none focus-visible:text-slate-900",
                on ? "border-emerald-700 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {t.label}
              {t.count !== undefined ? (
                <span className={cn("rounded px-1.5 text-xs tabular-nums", on ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500")}>
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{body}</p> : null}
    </div>
  );
}

/** Right-hand panel (full screen on phones). Escape or the backdrop closes it. */
export function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-white shadow-xl sm:max-w-xl sm:border-l sm:border-slate-200">
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-slate-900">{title}</div>
            {subtitle ? <div className="mt-0.5 text-[13px] text-slate-500">{subtitle}</div> : null}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={buttonClass("ghost", "sm") + " -mr-2 w-8 px-0"}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Small centred dialog for quick edits. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-slate-900/25" onClick={onClose} />
      <div
        className={cn(
          "relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-xl sm:border sm:border-slate-200",
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={buttonClass("ghost", "sm") + " -mr-2 w-8 px-0"}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** The app's six delivery steps as a compact bar: filled up to the order's stage. */
export function StepBar({ stage, muted = false }: { stage: string | null; muted?: boolean }) {
  const at = stepIndex(stage);
  return (
    <div className="flex items-center gap-0.5" aria-hidden>
      {DELIVERY_STEPS.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1 w-4 rounded-full",
            muted ? "bg-slate-200" : i <= at ? (at === 5 ? "bg-emerald-600" : "bg-sky-500") : "bg-slate-200"
          )}
        />
      ))}
    </div>
  );
}

/** Vertical version of the app's tracking stepper, with when each step happened. */
export function StepTimeline({
  stage,
  history,
  cancelled,
}: {
  stage: string | null;
  history: Array<{ checkpoint: string; createdAt: string; location?: string | null; note?: string | null; updatedBy?: string | null }>;
  cancelled?: boolean;
}) {
  const at = stepIndex(stage);
  const when = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <ol className="relative space-y-0">
      {DELIVERY_STEPS.map((step, i) => {
        const done = !cancelled && i <= at;
        const current = !cancelled && i === at;
        const event = history.find((h) => h.checkpoint === step);
        return (
          <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
            {i < DELIVERY_STEPS.length - 1 ? (
              <span aria-hidden className={cn("absolute left-[7px] top-4 h-full w-px", done && i < at ? "bg-emerald-600" : "bg-slate-200")} />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2",
                done ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-white",
                current && "ring-4 ring-emerald-600/15"
              )}
            >
              {done ? <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white"><path fill="none" stroke="currentColor" strokeWidth="2" d="m2.5 6.2 2.3 2.3 4.7-4.9" /></svg> : null}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className={cn("text-sm", done ? "font-medium text-slate-900" : "text-slate-400")}>{STEP_SHORT[step]}</p>
                {event && done ? <p className="text-xs tabular-nums text-slate-500">{when.format(new Date(event.createdAt))}</p> : null}
              </div>
              {event && done && (event.location || event.note) ? (
                <p className="mt-0.5 text-xs text-slate-500">{[event.location, event.note].filter(Boolean).join(" · ")}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function formatPhone(raw: string | null | undefined) {
  const d = String(raw ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(raw ?? "");
}

export function telHref(raw: string | null | undefined) {
  const d = String(raw ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `tel:+91${d}` : undefined;
}
