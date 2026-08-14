import type { WidgetPayload } from "@/lib/queries/widget";

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function compactInr(n: number) {
  if (n >= 100000) {
    const lakhs = n / 100000;
    return `₹${lakhs.toFixed(lakhs >= 10 ? 1 : 2)}L`;
  }
  if (n >= 1000) return `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return formatInr(n);
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export function WidgetPreview({ data }: { data: WidgetPayload }) {
  const max = Math.max(...data.trend.map((d) => d.total), 1);
  const pct = data.today.changePct;
  const up = pct >= 0;
  const lowStock = data.lowStock.slice(0, 3);

  return (
    <div
      className="flex h-[354px] w-[338px] flex-col rounded-[22px] bg-slate-50 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/80"
      aria-label="Large iPhone widget preview"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wide text-slate-500">
          TODAY&apos;S SALES
        </p>
        <p className="text-[11px] font-medium text-slate-400">
          {dateLabel(data.updatedAt)}
        </p>
      </div>

      <p className="mt-1 truncate text-[26px] font-bold leading-none tracking-tight text-slate-900">
        {formatInr(data.today.total)}
      </p>

      <p className="mt-1.5 truncate text-[11px] font-medium text-slate-600">
        {data.today.count} bills{" "}
        <span className={up ? "text-emerald-600" : "text-rose-600"}>
          {up ? "+" : ""}
          {pct.toFixed(0)}%
        </span>
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="text-emerald-600">Cash {compactInr(data.today.cash)}</span>
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="text-sky-600">UPI {compactInr(data.today.upi)}</span>
      </p>

      <div className="mt-2 flex h-[56px] items-end gap-1">
        {data.trend.map((d, i) => {
          const h = Math.max(d.total > 0 ? 6 : 3, (d.total / max) * 40);
          const isToday = i === data.trend.length - 1;
          return (
            <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-t-sm ${isToday ? "bg-emerald-600" : "bg-emerald-300"}`}
                style={{ height: h }}
              />
              <span
                className={`text-[9px] font-medium ${isToday ? "text-emerald-700" : "text-slate-500"}`}
              >
                {d.short.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] font-semibold tracking-wide text-slate-400">
        LOW STOCK
      </p>
      <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-hidden">
        {lowStock.length === 0 ? (
          <p className="text-xs text-slate-500">All products well stocked</p>
        ) : (
          lowStock.map((item) => (
            <div key={item.name} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {item.name}
              </span>
              <span
                className={`shrink-0 font-semibold ${item.qty <= 0 ? "text-rose-600" : "text-amber-600"}`}
              >
                {item.qty}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-1">
        <p className="truncate text-[10px] font-medium text-slate-400">
          {data.business}
        </p>
        <p className="shrink-0 text-[10px] text-slate-400">
          {timeLabel(data.updatedAt)}
        </p>
      </div>
    </div>
  );
}
