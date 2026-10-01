"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SalesTrendChart, type TrendPoint } from "./charts";
import { getSalesTrendData } from "@/lib/actions/dashboard";
import { formatCurrency } from "@/lib/utils";

type Preset = 7 | 30 | 90;

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: 7, label: "7D" },
  { key: 30, label: "30D" },
  { key: 90, label: "90D" },
];

function todayInput(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Sales Performance block: range presets + custom window, totals, chart.
 * Data refetches through the server action; the section dims while loading
 * instead of vanishing.
 */
export function SalesPerformance({ initial }: { initial: TrendPoint[] }) {
  const [data, setData] = useState(initial);
  const [preset, setPreset] = useState<Preset | "custom">(30);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const total = data.reduce((s, d) => s + d.total, 0);
  const bills = data.reduce((s, d) => s + d.bills, 0);
  const rangeLabel =
    preset === "custom" && from && to
      ? `${from} → ${to}`
      : `Last ${preset} days`;

  function load(
    next: Preset | "custom",
    custom?: { from: string; to: string }
  ) {
    setError("");
    setPreset(next);
    startTransition(async () => {
      try {
        const points =
          next === "custom" && custom
            ? await getSalesTrendData({
                preset: "custom",
                from: custom.from,
                to: custom.to,
              })
            : await getSalesTrendData({ preset: next as Preset });
        setData(points);
      } catch {
        setError("Unable to load sales data.");
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[22px] font-bold tabular-nums leading-tight text-slate-900">
            {formatCurrency(total, { round: true })}
          </p>
          <p className="text-xs text-slate-500">
            {bills} {bills === 1 ? "bill" : "bills"} · {rangeLabel}
          </p>
        </div>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Trend range"
        >
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={isPending}
              onClick={() => load(p.key)}
              aria-pressed={preset === p.key}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                preset === p.key
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const t = todayInput();
              setFrom((f) => f || t);
              setTo((t2) => t2 || t);
              setPreset("custom");
            }}
            aria-pressed={preset === "custom"}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              preset === "custom"
                ? "bg-emerald-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {preset === "custom" && (
        <form
          className="mb-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) load("custom", { from, to });
          }}
        >
          <div>
            <Label htmlFor="trend-from" className="sr-only">
              From date
            </Label>
            <Input
              id="trend-from"
              type="date"
              value={from}
              max={todayInput()}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="trend-to" className="sr-only">
              To date
            </Label>
            <Input
              id="trend-to"
              type="date"
              value={to}
              max={todayInput()}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={isPending || !from || !to}
            className="h-8 rounded-md bg-slate-900 px-3 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            Apply
          </button>
        </form>
      )}

      {error ? (
        <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-sm">
          <p className="text-slate-600">Unable to load sales data.</p>
          <button
            type="button"
            onClick={() =>
              preset === "custom" && from && to
                ? load("custom", { from, to })
                : load(preset as Preset)
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className={isPending ? "opacity-50 transition-opacity" : undefined}>
          <SalesTrendChart data={data} />
        </div>
      )}
    </div>
  );
}
