"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = {
  emerald: "#059669",
  sky: "#0284c8",
  teal: "#0d9488",
  amber: "#d97706",
  rose: "#e11d48",
  slate: "#64748b",
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: COLORS.emerald,
  upi: COLORS.sky,
  credit: COLORS.amber,
  card: COLORS.teal,
  cheque: COLORS.slate,
  neft: "#7c3aed",
};

/** Compact Indian axis ticks: 403181 → 4L, 12000 → 12K. */
export function compactInrTick(v: number): string {
  if (v >= 100000) {
    const l = v / 100000;
    return `${Number.isInteger(l) ? l : l.toFixed(1)}L`;
  }
  if (v >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(v);
}

export function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center px-4 text-center text-sm text-slate-400">
      {label}
    </div>
  );
}

export type TrendPoint = {
  date: string;
  label: string;
  total: number;
  bills: number;
};

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TrendPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-slate-700">{label}</p>
      <p className="font-semibold tabular-nums text-slate-900">
        {formatCurrency(point.total, { round: true })}
      </p>
      <p className="text-slate-500">
        {point.bills} {point.bills === 1 ? "bill" : "bills"}
      </p>
    </div>
  );
}

export function SalesTrendChart({ data }: { data: TrendPoint[] }) {
  const hasData = data.some((d) => d.total > 0);
  if (!hasData) return <ChartEmpty label="No sales in this period yet." />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.22} />
            <stop offset="100%" stopColor={COLORS.emerald} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={36}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={compactInrTick}
        />
        <Tooltip content={<TrendTooltip />} />
        <Area
          type="monotone"
          dataKey="total"
          stroke={COLORS.emerald}
          strokeWidth={2}
          fill="url(#salesFill)"
          dot={false}
          activeDot={{ r: 4, fill: COLORS.emerald, stroke: "#fff" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type PaymentSlice = {
  mode: string;
  label: string;
  total: number;
  count: number;
};

/**
 * Donut with the period total in the center and a real legend beneath:
 * every row names the mode with its amount and share, so color is never
 * the only encoding.
 */
export function PaymentDonut({ data }: { data: PaymentSlice[] }) {
  if (!data.length) return <ChartEmpty label="No payment data yet." />;
  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.mode}
                  fill={PAYMENT_COLORS[entry.mode] ?? COLORS.slate}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as PaymentSlice | undefined;
                if (!row) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                    <p className="font-medium capitalize text-slate-700">
                      {row.label}
                    </p>
                    <p className="font-semibold tabular-nums text-slate-900">
                      {formatCurrency(row.total, { round: true })}
                    </p>
                    <p className="text-slate-500">
                      {row.count} {row.count === 1 ? "bill" : "bills"}
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <p className="text-lg font-bold tabular-nums text-slate-900">
            {formatCurrency(total, { round: true })}
          </p>
          <p className="text-xs text-slate-500">collected</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {data.map((entry) => {
          const share = total > 0 ? Math.round((entry.total / total) * 100) : 0;
          return (
            <li
              key={entry.mode}
              className="flex items-baseline gap-2 text-[13px]"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: PAYMENT_COLORS[entry.mode] ?? COLORS.slate,
                }}
              />
              <span className="capitalize text-slate-600">{entry.label}</span>
              <span className="ml-auto font-semibold tabular-nums text-slate-900">
                {formatCurrency(entry.total, { round: true })}
              </span>
              <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">
                {share}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
