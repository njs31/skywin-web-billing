"use client";

import { useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import { buttonClass, inputClass, labelClass } from "@/components/shipping/ui";

type Quote = {
  provider: "manual" | "delhivery";
  label: string;
  amount: number;
  pin: string;
  weightGrams: number;
  transitDays: string;
  zone: string;
  courier: string;
};

const SAMPLES = [
  { place: "Chennai", pin: "600016" },
  { place: "Kumbakonam", pin: "612001" },
  { place: "Coimbatore", pin: "641001" },
  { place: "Bengaluru", pin: "560001" },
  { place: "Kochi", pin: "682001" },
  { place: "Delhi", pin: "110001" },
];

function grams(g: number) {
  return g >= 1000 ? `${Number((g / 1000).toFixed(2))} kg` : `${g} g`;
}

/** Shows exactly what the app's checkout would charge for a PIN code and an order weight. */
export function SimulatorTab({ bands }: { bands: Array<{ min: number; max: number }> }) {
  const [pin, setPin] = useState("");
  const [weight, setWeight] = useState("500");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const g = Math.round(Number(weight));
  const valid = /^[1-9]\d{5}$/.test(pin) && Number.isFinite(g) && g >= 1;

  const check = async (p = pin, w = g) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/shipping/quote?pin=${encodeURIComponent(p)}&grams=${encodeURIComponent(String(w))}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not price this delivery.");
      setQuote(data as Quote);
    } catch (err) {
      setQuote(null);
      setError(err instanceof Error ? err.message : "Could not price this delivery.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Price check</h2>
          <p className="mt-0.5 text-sm text-slate-500">What a farmer pays for delivery at checkout, with the delivery method that is on now.</p>
        </div>
        <form
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !loading) void check();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Delivery PIN code</span>
              <input
                inputMode="numeric"
                autoComplete="postal-code"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="600016"
                className={inputClass + " font-mono tabular-nums"}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Order weight (grams)</span>
              <input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, "").slice(0, 6))} className={inputClass + " tabular-nums"} />
            </label>
          </div>
          {bands.length ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span>Weight:</span>
              {[...new Set([...bands.map((b) => b.max), (bands.at(-1)?.max ?? 1000) * 2])].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeight(String(w))}
                  className={cn("rounded-md border px-2 py-0.5 tabular-nums", g === w ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-slate-200 hover:bg-slate-50")}
                >
                  {grams(w)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span>Try:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.pin}
                type="button"
                onClick={() => {
                  setPin(s.pin);
                  if (Number.isFinite(g) && g >= 1) void check(s.pin, g);
                }}
                className={cn("rounded-md border px-2 py-0.5", pin === s.pin ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-slate-200 hover:bg-slate-50")}
              >
                {s.place}
              </button>
            ))}
          </div>
          <button type="submit" className={buttonClass("primary") + " w-full sm:w-auto"} disabled={!valid || loading}>
            {loading ? "Checking…" : "Check price"}
          </button>
        </form>
      </section>

      <section aria-live="polite" className="lg:pt-[3.25rem]">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : quote ? (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-[13px] text-slate-500">
                {quote.label} for PIN <span className="font-mono">{quote.pin}</span>, {grams(quote.weightGrams)}
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{formatCurrency(quote.amount)}</p>
            </div>
            <dl className="divide-y divide-slate-100 text-sm">
              <Row label="Priced by" value={quote.provider === "delhivery" ? "Delhivery, live price" : "Your rate card"} />
              {quote.provider === "manual" ? <Row label="Zone" value={quote.zone || "—"} /> : null}
              <Row label="Courier" value={quote.courier} />
              <Row label="Transit" value={quote.transitDays || "—"} />
            </dl>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">
            Enter a PIN code and weight to see the delivery price.
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  );
}
