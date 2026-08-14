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
    return `${lakhs.toFixed(lakhs >= 10 ? 1 : 2)}L`;
  }
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
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
  const lowStock = data.lowStock.slice(0, 4);

  return (
    <div
      className="flex h-[354px] w-[338px] flex-col justify-between rounded-[22px] bg-gradient-to-br from-emerald-600 to-emerald-950 p-4 shadow-[0_8px_30px_rgba(6,78,59,0.35)]"
      aria-label="Large iPhone widget preview"
    >
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-wide text-white/55">
            TODAY&apos;S SALES
          </p>
          <p className="text-[11px] font-medium text-white/55">
            {dateLabel(data.updatedAt)}
          </p>
        </div>

        <p className="mt-1.5 truncate text-[32px] font-bold leading-none tracking-tight text-white">
          {formatInr(data.today.total)}
        </p>

        <p className="mt-2 truncate text-[11px] font-medium text-white/75">
          {data.today.count} bills{" "}
          <span className={up ? "text-emerald-200" : "text-rose-200"}>
            {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
          </span>
          <span className="mx-1.5 text-white/30">·</span>
          <span className="text-emerald-200">Cash {compactInr(data.today.cash)}</span>
          <span className="mx-1.5 text-white/30">·</span>
          <span className="text-sky-200">UPI {compactInr(data.today.upi)}</span>
        </p>
      </div>

      <div className="flex h-[68px] items-end gap-1.5">
        {data.trend.map((d, i) => {
          const h = Math.max(d.total > 0 ? 6 : 3, (d.total / max) * 48);
          const isToday = i === data.trend.length - 1;
          return (
            <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-[3px] ${isToday ? "bg-emerald-200" : "bg-white/40"}`}
                style={{ height: h }}
              />
              <span
                className={`text-[9px] font-medium ${isToday ? "text-emerald-200" : "text-white/55"}`}
              >
                {d.short.slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-wide text-white/55">
          LOW STOCK
        </p>
        <div className="mt-1.5 space-y-1 overflow-hidden">
          {lowStock.length === 0 ? (
            <p className="text-xs text-white/75">All products well stocked</p>
          ) : (
            lowStock.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-white/75">
                  {item.name}
                </span>
                <span
                  className={`shrink-0 font-semibold ${item.qty <= 0 ? "text-rose-200" : "text-amber-200"}`}
                >
                  {item.qty}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="truncate text-[10px] font-medium text-white/55">
          {data.business}
        </p>
        <p className="shrink-0 text-[10px] text-white/55">
          Updated {timeLabel(data.updatedAt)}
        </p>
      </div>
    </div>
  );
}
