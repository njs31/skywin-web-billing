"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = {
  lime: "#84cc16",
  emerald: "#059669",
  teal: "#0d9488",
  amber: "#d97706",
  slate: "#64748b",
  rose: "#e11d48",
  sky: "#0284c8",
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: COLORS.emerald,
  upi: COLORS.sky,
  credit: COLORS.amber,
  card: COLORS.teal,
  cheque: COLORS.slate,
};

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
      {label}
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium text-slate-700">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-slate-600" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

export function SalesTrendChart({
  data,
}: {
  data: { label: string; total: number; bills: number }[];
}) {
  const hasData = data.some((d) => d.total > 0);
  if (!hasData) return <ChartEmpty label="No sales in this period yet." />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.35} />
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
          minTickGap={28}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
          }
        />
        <Tooltip content={<MoneyTooltip />} />
        <Area
          type="monotone"
          dataKey="total"
          name="Sales"
          stroke={COLORS.emerald}
          strokeWidth={2}
          fill="url(#salesFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PaymentMixChart({
  data,
}: {
  data: { mode: string; label: string; total: number; count: number }[];
}) {
  if (!data.length) return <ChartEmpty label="No payment data yet." />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={58}
          outerRadius={88}
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
        <Tooltip content={<MoneyTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={28}
          formatter={(value) => (
            <span className="text-xs text-slate-600">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BillTypeChart({
  data,
}: {
  data: { type: string; label: string; total: number; count: number }[];
}) {
  const hasData = data.some((d) => d.total > 0);
  if (!hasData) return <ChartEmpty label="No retail/wholesale sales yet." />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
          }
        />
        <Tooltip content={<MoneyTooltip />} />
        <Bar dataKey="total" name="Sales" radius={[8, 8, 0, 0]} maxBarSize={64}>
          {data.map((entry) => (
            <Cell
              key={entry.type}
              fill={entry.type === "retail" ? COLORS.emerald : COLORS.teal}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopProductsChart({
  data,
}: {
  data: { name: string; fullName: string; qty: number; revenue: number }[];
}) {
  if (!data.length) return <ChartEmpty label="No product sales yet." />;

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
          }
        />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fontSize: 11, fill: "#475569" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as (typeof data)[0];
            return (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                <p className="mb-1 font-medium text-slate-700">{row.fullName}</p>
                <p className="text-slate-600">Revenue: {formatCurrency(row.revenue)}</p>
                <p className="text-slate-500">Qty: {row.qty}</p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="revenue"
          name="Revenue"
          fill={COLORS.lime}
          radius={[0, 6, 6, 0]}
          maxBarSize={18}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashUpiChart({ cash, upi }: { cash: number; upi: number }) {
  const data = [
    { label: "Cash", total: cash, key: "cash" },
    { label: "UPI", total: upi, key: "upi" },
  ].filter((d) => d.total > 0);

  if (!data.length) return <ChartEmpty label="No cash/UPI settlements yet." />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={3}
          stroke="#fff"
          strokeWidth={2}
        >
          {data.map((entry) => (
            <Cell
              key={entry.key}
              fill={entry.key === "cash" ? COLORS.emerald : COLORS.sky}
            />
          ))}
        </Pie>
        <Tooltip content={<MoneyTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={28}
          formatter={(value) => (
            <span className="text-xs text-slate-600">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function OutstandingChart({
  receivables,
  payables,
}: {
  receivables: number;
  payables: number;
}) {
  const data = [
    { label: "Receivable", total: receivables, key: "recv" },
    { label: "Payable", total: payables, key: "pay" },
  ];
  const hasData = data.some((d) => d.total > 0);
  if (!hasData) return <ChartEmpty label="No outstanding balances." />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
          }
        />
        <Tooltip content={<MoneyTooltip />} />
        <Bar dataKey="total" name="Amount" radius={[8, 8, 0, 0]} maxBarSize={64}>
          {data.map((entry) => (
            <Cell
              key={entry.key}
              fill={entry.key === "recv" ? COLORS.amber : COLORS.rose}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
