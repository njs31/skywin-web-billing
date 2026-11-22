"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PUBLIC_SHIPPING_HOST } from "@/lib/site-hosts";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Truck,
  Package,
  Layers,
  Calculator,
  LogOut,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { logout } from "@/lib/actions/auth";
import type { ShippingProviderMode } from "@/lib/delivery/shipping-constants";

export function ShippingShell({
  children,
  userName,
  userRole,
  initialProvider,
  billingHref,
}: {
  children: React.ReactNode;
  userName?: string | null;
  userRole?: string | null;
  initialProvider: ShippingProviderMode;
  billingHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "orders";

  const [provider, setProvider] = useState<ShippingProviderMode>(initialProvider);
  const [switching, startSwitching] = useTransition();
  const [switchSuccess, setSwitchSuccess] = useState(false);
  const [switchError, setSwitchError] = useState("");

  const handleToggleProvider = (newProvider: ShippingProviderMode) => {
    if (newProvider === provider || switching) return;
    setSwitchError("");
    setSwitchSuccess(false);

    startSwitching(async () => {
      try {
        const res = await fetch("/api/shipping/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "switch_provider",
            provider: newProvider,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to switch provider");

        setProvider(newProvider);
        setSwitchSuccess(true);
        setTimeout(() => setSwitchSuccess(false), 3000);
        router.refresh();
      } catch (err) {
        setSwitchError(err instanceof Error ? err.message : "Failed to switch");
      }
    });
  };

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-600 to-green-800 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg tracking-tight text-slate-900">
                    SkyWin Shipping
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                    {PUBLIC_SHIPPING_HOST}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">Logistics & Delivery Dispatch</p>
              </div>
            </div>

            {/* Center: delivery method switches (exactly one is on) */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="hidden text-xs font-semibold text-slate-500 md:inline">Delivery method:</span>
              <ProviderSwitch
                label="Delhivery fees"
                hint="Customers pay Delhivery's live rate"
                on={provider === "delhivery"}
                busy={switching}
                tone="blue"
                onChange={(next) => handleToggleProvider(next ? "delhivery" : "manual")}
              />
              <ProviderSwitch
                label="Delivery fees (rate sheet)"
                hint="Customers pay the Rates tab prices"
                on={provider === "manual"}
                busy={switching}
                tone="emerald"
                onChange={(next) => handleToggleProvider(next ? "manual" : "delhivery")}
              />
              {switching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>

            {/* Right: User / Links */}
            <div className="flex items-center gap-3">
              <Link
                href={billingHref}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                title="Go to SkyWin Billing"
              >
                <span>POS & Billing</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>

              <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block" />

              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold text-slate-800 leading-tight">{userName || "Officer"}</p>
                <p className="text-[10px] text-slate-500 capitalize">{userRole?.replace("_", " ") || "Admin"}</p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  router.push("/login");
                }}
                title="Sign out"
                className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Live switch alert banner */}
        {switchSuccess && (
          <div className="bg-emerald-600 text-white text-xs py-1.5 px-4 text-center font-medium flex items-center justify-center gap-1.5 transition-all">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>
              Shipping provider switched to <strong>{provider === "manual" ? "Manual Rate Sheet (SkyWin Delivery)" : "Delhivery API"}</strong>! It is immediately live on the mobile app via OTA.
            </span>
          </div>
        )}

        {switchError && (
          <div className="bg-rose-600 text-white text-xs py-1.5 px-4 text-center font-medium flex items-center justify-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{switchError}</span>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="border-t border-slate-100 bg-slate-50/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <nav className="flex space-x-1 sm:space-x-4 py-2" aria-label="Tabs">
              <button
                type="button"
                onClick={() => setTab("orders")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  currentTab === "orders"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                <Package className="h-4 w-4" />
                <span>Orders & Checkpoints</span>
              </button>

              <button
                type="button"
                onClick={() => setTab("rates")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  currentTab === "rates"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Weight & Destination Rates</span>
              </button>

              <button
                type="button"
                onClick={() => setTab("simulator")}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  currentTab === "simulator"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                <Calculator className="h-4 w-4" />
                <span>Rate Simulator</span>
              </button>
            </nav>

            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>
                Current App Method: <strong className="text-slate-700">{provider === "manual" ? "SkyWin Manual Rates" : "Delhivery Surface"}</strong>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        <p>
          SkyWin Biotech · Shipping Dispatch & Rate Matrix · {PUBLIC_SHIPPING_HOST}
        </p>
      </footer>
    </div>
  );
}

/** One on/off switch; turning it on turns the other method off. */
function ProviderSwitch({
  label,
  hint,
  on,
  busy,
  tone,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  busy: boolean;
  tone: "blue" | "emerald";
  onChange: (next: boolean) => void;
}) {
  const track = on ? (tone === "blue" ? "bg-blue-600" : "bg-emerald-600") : "bg-slate-300";
  return (
    <label
      title={hint}
      className={`flex cursor-pointer select-none items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors ${
        on ? "bg-white shadow-sm ring-1 ring-slate-200" : "hover:bg-white/70"
      } ${busy ? "pointer-events-none opacity-60" : ""}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={busy || on}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 disabled:cursor-default ${track}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className={`text-xs font-semibold ${on ? "text-slate-900" : "text-slate-500"}`}>{label}</span>
    </label>
  );
}
