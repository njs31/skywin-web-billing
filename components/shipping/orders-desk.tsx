"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { OrderView } from "@/lib/field-order-view";
import { orderStatus, type OrderGroup } from "@/lib/order-status";
import {
  EmptyState,
  FilterTabs,
  Figures,
  PageHeader,
  SearchInput,
  SidePanel,
  StatusBadge,
  StepBar,
  StepTimeline,
  buttonClass,
  formatPhone,
  telHref,
} from "@/components/shipping/ui";
import { OrderActions } from "@/components/shipping/order-actions";

export type StageEvent = { checkpoint: string; createdAt: string; location: string | null; note: string | null };

type Filter = "all" | OrderGroup;

const PAGE = 50;

function shortDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function OrdersDesk({
  orders,
  history,
  canRefund,
  stats,
}: {
  orders: OrderView[];
  history: Record<string, StageEvent[]>;
  canRefund: boolean;
  stats: { todayCount: number; todayTotal: number; monthCount: number; monthTotal: number };
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const close = useCallback(() => setOpenId(null), []);

  const withStatus = useMemo(() => orders.map((o) => ({ o, s: orderStatus(o) })), [orders]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: orders.length, dispatch: 0, transit: 0, delivered: 0, refunded: 0, cancelled: 0 };
    for (const { o, s } of withStatus) {
      if (s.group !== "refunded") c[s.group] += 1;
      // Refunds lists every order with money returned, including partial refunds.
      if (o.refunded > 0) c.refunded += 1;
    }
    return c;
  }, [withStatus, orders.length]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return withStatus.filter(({ o, s }) => {
      if (filter === "refunded" ? o.refunded <= 0 : filter !== "all" && s.group !== filter) return false;
      if (!q) return true;
      const text = [o.orderId, o.invoiceNo, o.farmerName, o.placedBy, o.paymentId, o.waybill, ...o.goods.map((g) => g.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q) || (digits.length >= 4 && o.farmerPhone.replace(/\D/g, "").includes(digits));
    });
  }, [withStatus, filter, query]);

  const open = openId != null ? withStatus.find(({ o }) => o.id === openId) ?? null : null;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Orders"
        description="Paid orders from the SkyWin Field app. Open an order to see what was bought, track it, or refund it."
        actions={
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setLimit(PAGE);
            }}
            placeholder="Order, farmer, phone, product…"
            className="w-full md:w-80"
          />
        }
      />

      <Figures
        items={[
          { label: "Today", value: String(stats.todayCount), sub: formatCurrency(stats.todayTotal) },
          { label: "This month", value: String(stats.monthCount), sub: formatCurrency(stats.monthTotal) },
          { label: "To dispatch", value: String(counts.dispatch), sub: counts.dispatch === 1 ? "order waiting" : "orders waiting" },
          { label: "On the way", value: String(counts.transit), sub: "dispatched, not delivered" },
        ]}
      />

      <FilterTabs<Filter>
        label="Order status"
        value={filter}
        onChange={(k) => {
          setFilter(k);
          setLimit(PAGE);
        }}
        tabs={[
          { key: "all", label: "All", count: counts.all },
          { key: "dispatch", label: "To dispatch", count: counts.dispatch },
          { key: "transit", label: "On the way", count: counts.transit },
          { key: "delivered", label: "Delivered", count: counts.delivered },
          { key: "refunded", label: "Refunds", count: counts.refunded },
          { key: "cancelled", label: "Cancelled", count: counts.cancelled },
        ]}
      />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {shown.length === 0 ? (
          <EmptyState
            title={orders.length === 0 ? "No orders yet" : "No orders match"}
            body={orders.length === 0 ? "An order shows here as soon as a farmer pays in the app." : "Try another name, phone number or status."}
          />
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-sm xl:table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Farmer</th>
                  <th className="px-4 py-2.5 font-medium">Items</th>
                  <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map(({ o, s }) => (
                  <tr
                    key={o.id}
                    onClick={() => setOpenId(o.id)}
                    className={cn("cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50", s.group === "cancelled" && "text-slate-500")}
                  >
                    <td className="px-4 py-3">
                      <button type="button" className="text-left font-mono text-[13px] font-medium text-slate-900 hover:text-emerald-800 focus-visible:outline-none focus-visible:underline" onClick={(e) => { e.stopPropagation(); setOpenId(o.id); }}>
                        {o.orderId}
                      </button>
                      <p className="mt-0.5 text-xs tabular-nums text-slate-500">{shortDate(o.date)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{o.farmerName || "—"}</p>
                      <p className="text-xs tabular-nums text-slate-500">
                        {[formatPhone(o.farmerPhone), o.placedBy ? `via ${o.placedBy}` : ""].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <ItemsSummary goods={o.goods} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <p className={cn("font-medium tabular-nums text-slate-900", s.group === "cancelled" && "text-slate-400 line-through")}>{formatCurrency(o.paid)}</p>
                      {o.refunded > 0 ? <p className="text-xs tabular-nums text-amber-700">−{formatCurrency(o.refunded)}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                      <div className="mt-1.5">
                        <StepBar stage={o.stage} muted={s.group === "cancelled"} />
                      </div>
                    </td>
                    <td className="px-2 py-3 text-slate-400">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Phones and tablets */}
            <ul className="divide-y divide-slate-100 xl:hidden">
              {shown.slice(0, limit).map(({ o, s }) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpenId(o.id)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-medium text-slate-900">{o.farmerName || "—"}</p>
                        <p className={cn("shrink-0 font-medium tabular-nums text-slate-900", s.group === "cancelled" && "text-slate-400 line-through")}>
                          {formatCurrency(o.paid)}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                        {o.orderId} · <span className="font-sans">{shortDate(o.date)}</span>
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                        <StepBar stage={o.stage} muted={s.group === "cancelled"} />
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {shown.length > limit ? (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
                <span className="tabular-nums">
                  Showing {limit} of {shown.length}
                </span>
                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setLimit((n) => n + PAGE)}>
                  Show more
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <SidePanel
        open={!!open}
        onClose={close}
        title={open ? <span className="font-mono">{open.o.orderId}</span> : null}
        subtitle={open ? `${shortDate(open.o.date)} · ${open.s.label}` : null}
      >
        {open ? <OrderDetail order={open.o} events={history[open.o.orderId] ?? []} canRefund={canRefund} /> : null}
      </SidePanel>
    </div>
  );
}

function ItemsSummary({ goods }: { goods: OrderView["goods"] }) {
  if (goods.length === 0) return <span className="text-slate-400">—</span>;
  const first = goods[0];
  return (
    <p className="truncate text-slate-700">
      {first.name} <span className="text-slate-400">×</span> {first.qty}
      {goods.length > 1 ? <span className="text-slate-500"> · +{goods.length - 1} more</span> : null}
    </p>
  );
}

function OrderDetail({ order, events, canRefund }: { order: OrderView; events: StageEvent[]; canRefund: boolean }) {
  const s = orderStatus(order);
  const goodsTotal = order.goods.reduce((sum, g) => sum + g.amount, 0);
  // Line amounts are before GST; the rest of the invoice total is GST (and any round-off).
  const gst = Math.max(0, Math.round((order.total - goodsTotal - order.deliveryCharge) * 100) / 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
        <a href={`/invoices/${order.id}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
          Invoice {order.invoiceNo}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        {order.trackUrl ? (
          <a href={order.trackUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
            Track on Delhivery
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      <Section title="Items">
        {order.goods.length === 0 ? (
          <p className="text-sm text-slate-500">No item lines on this invoice.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {order.goods.map((g, i) => (
              <li key={i} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">
                    {g.name} <span className="text-slate-400">×</span> {g.qty}
                  </p>
                  {g.batch || g.expiry ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[g.batch ? `Batch ${g.batch}` : "", g.expiry ? `Exp ${g.expiry}` : ""].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm tabular-nums text-slate-700">{formatCurrency(g.amount)}</p>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-3 space-y-1 text-sm">
          <Row label="Products (before GST)" value={formatCurrency(goodsTotal)} />
          {order.deliveryCharge > 0 ? <Row label="Delivery" value={formatCurrency(order.deliveryCharge)} /> : null}
          {gst > 0.004 ? <Row label="GST" value={formatCurrency(gst)} /> : null}
          <Row label="Invoice total" value={formatCurrency(order.total)} strong />
          {order.refunded > 0 ? <Row label="Refunded" value={`−${formatCurrency(order.refunded)}`} tone="text-amber-700" /> : null}
        </dl>
      </Section>

      <Section title="Farmer">
        <p className="text-sm font-medium text-slate-900">{order.farmerName || "—"}</p>
        <p className="mt-0.5 text-sm text-slate-600">
          {telHref(order.farmerPhone) ? (
            <a href={telHref(order.farmerPhone)} className="tabular-nums text-emerald-800 hover:underline">
              {formatPhone(order.farmerPhone)}
            </a>
          ) : (
            "No phone"
          )}
          <span className="text-slate-400"> · </span>
          {order.placedBy ? `ordered by officer ${order.placedBy}` : "ordered in the app"}
        </p>
        {order.mapsUrl ? (
          <a href={order.mapsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-emerald-800 hover:underline">
            Location when ordered ({order.gps})
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </Section>

      <Section title="Payment">
        {order.paymentId ? (
          <div className="flex items-center gap-2">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-800">{order.paymentId}</code>
            <CopyButton text={order.paymentId} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">No Razorpay payment recorded.</p>
        )}
      </Section>

      <Section title="Delivery">
        {order.waybill && !order.trackUrl ? (
          <p className="mb-3 text-sm text-slate-600">SkyWin delivery · reference {order.waybill}</p>
        ) : null}
        {order.trackUrl ? <p className="mb-3 text-sm text-slate-600">Delhivery waybill {order.waybill}</p> : null}
        <StepTimeline stage={order.stage} history={events} cancelled={order.status === "cancelled"} />
        <Link href="/shipping" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-800 hover:underline">
          Update the delivery stage in Shipping & Dispatch
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Section>

      {canRefund ? (
        <Section title="Refund or cancel">
          <OrderActions
            saleId={order.id}
            invoiceNo={order.invoiceNo}
            paid={order.paid}
            refunded={order.refunded}
            status={order.status}
            paymentId={order.paymentId}
          />
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "border-t border-slate-200 pt-1.5 font-medium text-slate-900")}>
      <dt className={strong ? "" : "text-slate-500"}>{label}</dt>
      <dd className={cn("tabular-nums", tone ?? (strong ? "" : "text-slate-700"))}>{value}</dd>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy payment ID"
      className={buttonClass("ghost", "sm") + " w-8 px-0"}
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
