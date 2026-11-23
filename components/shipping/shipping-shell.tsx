"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShippingProviderMode } from "@/lib/delivery/shipping-constants";
import { PageHeader, buttonClass } from "@/components/shipping/ui";

const TABS = [
  { key: "orders", label: "Dispatch" },
  { key: "rates", label: "Rate card" },
  { key: "simulator", label: "Price check" },
] as const;

export function ShippingShell({
  children,
  initialProvider,
  billingHref,
}: {
  children: React.ReactNode;
  initialProvider: ShippingProviderMode;
  billingHref: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "orders";

  const [provider, setProvider] = useState<ShippingProviderMode>(initialProvider);
  const [switching, startSwitching] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const switchTo = (next: ShippingProviderMode) => {
    if (next === provider || switching) return;
    setNotice(null);
    startSwitching(async () => {
      try {
        const res = await fetch("/api/shipping/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "switch_provider", provider: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not change the delivery method.");
        setProvider(next);
        setNotice({
          ok: true,
          text:
            next === "delhivery"
              ? "Saved. Checkout now charges Delhivery fees at Delhivery's live price."
              : "Saved. Checkout now charges Delivery fees from your rate card.",
        });
        router.refresh();
      } catch (err) {
        setNotice({ ok: false, text: err instanceof Error ? err.message : "Could not change the delivery method." });
      }
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Shipping & Dispatch"
        description="Move paid orders through delivery. Farmers see every step in the app and get a notification."
        actions={
          <>
            <div
              role="group"
              aria-label="Delivery method"
              className={cn("flex items-center gap-1 rounded-lg border border-slate-200 bg-white py-1 pl-3 pr-1", switching && "opacity-70")}
            >
              <span className="mr-1 whitespace-nowrap text-[13px] text-slate-500">Delivery method</span>
              <MethodSwitch label="Delhivery" on={provider === "delhivery"} busy={switching} onTurnOn={() => switchTo("delhivery")} />
              <MethodSwitch label="Delivery" on={provider === "manual"} busy={switching} onTurnOn={() => switchTo("manual")} />
            </div>
            <a href={billingHref} className={buttonClass("ghost")}>
              POS & Billing
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </>
        }
      />

      {notice ? (
        <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>
          {notice.text}
        </p>
      ) : null}

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav aria-label="Shipping sections" className="flex min-w-max gap-6 border-b border-slate-200">
          {TABS.map((t) => {
            const on = currentTab === t.key;
            return (
              <Link
                key={t.key}
                href={`/shipping?tab=${t.key}`}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 pb-2.5 pt-1 text-sm transition-colors",
                  on ? "border-emerald-700 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}

/** One of the two method switches; turning one on turns the other off. */
function MethodSwitch({ label, on, busy, onTurnOn }: { label: string; on: boolean; busy: boolean; onTurnOn: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy || on}
      onClick={onTurnOn}
      title={on ? `${label} is on` : `Turn on ${label}`}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-default",
        on ? "bg-slate-100 font-medium text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      )}
    >
      {label}
      <span className={cn("relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors", on ? "bg-emerald-600" : "bg-slate-300")}>
        <span className={cn("inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform", on ? "translate-x-[14px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}
