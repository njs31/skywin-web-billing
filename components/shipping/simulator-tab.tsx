"use client";

import { useState, useTransition } from "react";
import {
  Calculator,
  Search,
  CheckCircle2,
  Clock,
  MapPin,
  Truck,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export function SimulatorTab() {
  const [pin, setPin] = useState("600016");
  const [weightGrams, setWeightGrams] = useState("350");
  const [result, setResult] = useState<{
    pin: string;
    amount: number;
    weightGrams: number;
    transitDays: string;
    zoneName: string;
    slab: string;
    provider: string;
    courier: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch(
        `/api/field/delivery/quote?pin=${encodeURIComponent(
          pin
        )}&kg=${encodeURIComponent(String(Number(weightGrams) / 1000))}`,
        {
          headers: {
            "x-api-key": "skywin_field_api_key_4c8e2b19",
          },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to calculate rate");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  };

  const presetExamples = [
    { label: "Chennai Suburbs (350g)", pin: "600016", weight: "350" },
    { label: "Kumbakonam / Thanjavur (450g)", pin: "612401", weight: "450" },
    { label: "Coimbatore / South TN (750g)", pin: "641001", weight: "750" },
    { label: "Bangalore Urban (800g)", pin: "560001", weight: "800" },
    { label: "Mumbai Metro (400g)", pin: "400001", weight: "400" },
    { label: "Delhi NCR (900g)", pin: "110001", weight: "900" },
    { label: "Kerala / Kochi (600g)", pin: "682001", weight: "600" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-800">
            Live Rate Simulator (Checkout Preview)
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Test any PIN code and package weight to simulate the exact delivery fee that will be returned
          to the mobile app checkout in real-time.
        </p>

        {/* Preset quick test buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          {presetExamples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setPin(ex.pin);
                setWeightGrams(ex.weight);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleCalculate} className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Destination 6-digit PIN
            </label>
            <input
              type="text"
              maxLength={6}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Order Total Weight (Grams)
            </label>
            <input
              type="number"
              min={10}
              required
              value={weightGrams}
              onChange={(e) => setWeightGrams(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading || pin.length !== 6}
              className="w-full py-2 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <span>Calculating…</span>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Calculate Checkout Rate</span>
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs border border-rose-200">
            {error}
          </div>
        )}
      </div>

      {/* Result Card */}
      {result && (
        <div className="bg-gradient-to-br from-emerald-50 to-white p-6 rounded-2xl border-2 border-emerald-300 shadow-md space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Checkout Rate Response
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-200/60 text-emerald-900 border border-emerald-300">
              Provider: {result.provider === "manual" ? "Manual Rate Sheet" : "Delhivery API"}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Delivery Fee</span>
              <div className="text-2xl font-black text-emerald-700">₹{result.amount}</div>
              <span className="text-[10px] text-slate-400">added at checkout</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Charged Weight</span>
              <div className="text-lg font-bold text-slate-800">{result.weightGrams} g</div>
              <span className="text-[10px] text-slate-400">({(result.weightGrams / 1000).toFixed(2)} kg)</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Estimated Transit</span>
              <div className="text-lg font-bold text-slate-800">{result.transitDays || "3 - 5 Days"}</div>
              <span className="text-[10px] text-slate-400">from Kumbakonam</span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Carrier / Courier</span>
              <div className="text-lg font-bold text-slate-800">{result.courier || "SkyWin Delivery"}</div>
              <span className="text-[10px] text-slate-400">shown on mobile app</span>
            </div>
          </div>

          {result.zoneName && (
            <div className="bg-white/80 p-3 rounded-xl border border-emerald-100 text-xs flex items-center justify-between text-slate-700">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <span>
                  Matched Zone: <strong>{result.zoneName}</strong> ({result.slab})
                </span>
              </div>
              <span className="text-emerald-700 font-semibold font-mono">PIN {result.pin}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
