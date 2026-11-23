/**
 * SkyWin Field dashboard design kit. Works in server and client components (no hooks).
 * Palette follows the Field app: forest #1E3317, leaf #245B3E, lime #C6E26A, sage #EDF2E7,
 * paper #F4F3EE, ink #29332C, muted #5E6B62, red #8E3B34.
 */
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ---------- Page header ---------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[#245B3E] hover:underline"
          >
            <span aria-hidden>←</span> {back.label}
          </Link>
        ) : null}
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3E5E2F]">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1E3317] sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#5E6B62]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </header>
  );
}

/* ---------- Stats ---------- */

export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <section
      className={cn(
        "grid grid-cols-2 gap-3",
        cols === 3 ? "lg:grid-cols-3" : cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-2"
      )}
    >
      {children}
    </section>
  );
}

export function StatCard({
  icon,
  label,
  value,
  sub,
  href,
  dark = false,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  dark?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start gap-2">
        {icon ? (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4",
              dark ? "bg-[#C6E26A] text-[#1E3317]" : "bg-[#EDF2E7] text-[#3E5E2F]"
            )}
          >
            {icon}
          </span>
        ) : null}
        <p className={cn("min-w-0 flex-1 self-center text-xs font-semibold leading-4 [overflow-wrap:anywhere]", dark ? "text-white/80" : "text-[#5E6B62]")}>{label}</p>
      </div>
      <p className="mt-3 truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{value}</p>
      {sub ? <p className={cn("mt-0.5 text-xs leading-4", dark ? "text-white/65" : "text-[#5E6B62]")}>{sub}</p> : null}
    </>
  );
  const cls = cn(
    "block min-w-0 rounded-2xl border p-4 shadow-sm transition-colors",
    dark ? "border-transparent bg-[#1E3317] text-white" : "border-[#1E3317]/10 bg-white text-[#1E3317]",
    href && (dark ? "hover:bg-[#244020]" : "hover:border-[#1E3317]/25")
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ---------- Surfaces ---------- */

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E3317]/8 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-bold text-[#1E3317]">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-[#5E6B62]">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>{children}</div>;
}

/* ---------- Controls ---------- */

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "lime";

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-45 [&>svg]:h-4 [&>svg]:w-4",
    size === "sm" ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
    variant === "primary" && "bg-[#1E3317] text-white shadow-sm hover:bg-[#2E4A22]",
    variant === "lime" && "bg-[#C6E26A] text-[#1E3317] shadow-sm hover:bg-[#B8D94A]",
    variant === "secondary" && "border border-[#1E3317]/15 bg-white text-[#1E3317] hover:border-[#1E3317]/30 hover:bg-[#F4F8EF]",
    variant === "danger" && "border border-[#8E3B34]/25 bg-white text-[#8E3B34] hover:bg-[#FBEAE8]",
    variant === "ghost" && "text-[#245B3E] hover:bg-[#EDF2E7]"
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-[#1E3317]/15 bg-white px-3 text-sm text-[#1E3317] outline-none transition-colors placeholder:text-[#5E6B62]/70 focus:border-[#3E5E2F]/45 focus:ring-2 focus:ring-[#C6E26A]/45 disabled:bg-[#F4F3EE] disabled:text-[#5E6B62]";

export const labelClass = "mb-1 block text-xs font-semibold text-[#3E5E2F]";

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  className,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
  onEnter?: () => void;
}) {
  return (
    <label className={cn("relative block w-full sm:max-w-sm", className)}>
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5E6B62]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
        className={cn(inputClass, "h-11 pl-9 shadow-sm")}
      />
    </label>
  );
}

/* ---------- Status ---------- */

export type Tone = "green" | "lime" | "amber" | "red" | "blue" | "grey";

const TONE: Record<Tone, string> = {
  green: "bg-[#E4F1DA] text-[#245B3E] ring-[#245B3E]/15",
  lime: "bg-[#EEF6CF] text-[#3E5E2F] ring-[#3E5E2F]/15",
  amber: "bg-[#FFF4E0] text-[#8A5A00] ring-[#8A5A00]/15",
  red: "bg-[#FBEAE8] text-[#8E3B34] ring-[#8E3B34]/15",
  blue: "bg-[#E6EEF8] text-[#1F4E8C] ring-[#1F4E8C]/15",
  grey: "bg-[#F1F2EE] text-[#5E6B62] ring-[#5E6B62]/15",
};

export function Badge({ tone = "grey", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1", TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "green", children }: { tone?: "green" | "red" | "amber"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "red" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-4 py-3 text-sm",
        tone === "green" && "bg-[#E4F1DA] text-[#245B3E]",
        tone === "red" && "bg-[#FBEAE8] text-[#8E3B34]",
        tone === "amber" && "bg-[#FFF4E0] text-[#8A5A00]"
      )}
    >
      {children}
    </p>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      {icon ? (
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF2E7] text-[#3E5E2F] [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
      ) : null}
      <p className="mt-3 text-sm font-semibold text-[#1E3317]">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-sm text-[#5E6B62]">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ---------- Tables (become cards on phones) ---------- */

export const tableClass = "w-full text-left text-sm";
export const theadClass =
  "border-b border-[#1E3317]/8 bg-[#FAFBF7] text-[11px] font-semibold uppercase tracking-wide text-[#5E6B62]";
export const thClass = "px-4 py-3 font-semibold";
export const tdClass = "px-4 py-3 align-top";
export const trClass = "border-t border-[#1E3317]/8 transition-colors first:border-t-0 hover:bg-[#FAFBF7]";

/** Card used instead of a table row below the md breakpoint. */
export function MobileCard({ children, href }: { children: React.ReactNode; href?: string }) {
  const cls = "block border-t border-[#1E3317]/8 px-4 py-3.5 first:border-t-0";
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-[#FAFBF7]")}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function Pager({
  from,
  to,
  total,
  label,
  onPrev,
  onNext,
  canPrev,
  canNext,
  prevLabel,
  nextLabel,
}: {
  from: number;
  to: number;
  total: number;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  prevLabel: string;
  nextLabel: string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1E3317]/8 bg-[#FAFBF7] px-4 py-3 text-xs text-[#5E6B62]">
      <span className="tabular-nums">{label.replace("{from}", String(from)).replace("{to}", String(to)).replace("{total}", total.toLocaleString("en-IN"))}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onPrev} disabled={!canPrev} className={buttonClass("secondary", "sm")}>
          {prevLabel}
        </button>
        <button type="button" onClick={onNext} disabled={!canNext} className={buttonClass("secondary", "sm")}>
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

/** On/off switch. The label is read by screen readers and shown when showLabel is set. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  showLabel = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-full text-xs font-semibold text-[#1E3317] outline-none focus-visible:ring-2 focus-visible:ring-[#B8D94A]/60 disabled:cursor-not-allowed disabled:opacity-60"
      )}
    >
      {showLabel ? <span>{label}</span> : null}
      <span className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", checked ? "bg-[#245B3E]" : "bg-[#C9D1C4]")}>
        <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}
