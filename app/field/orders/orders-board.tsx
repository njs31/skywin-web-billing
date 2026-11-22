"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  CreditCard,
  ExternalLink,
  IndianRupee,
  MapPin,
  Package,
  Phone,
  Search,
  ShoppingBag,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { OrderRefundPanel } from "@/components/field/order-refund-panel";
import { formatCurrency } from "@/lib/utils";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt, type FieldText } from "@/lib/field-i18n";

export type OrderView = {
  id: number;
  orderId: string;
  invoiceNo: string;
  date: string;
  status: string;
  stage: string | null;
  farmerName: string;
  farmerPhone: string;
  /** Officer who placed it for the farmer; empty when the farmer ordered in the app. */
  placedBy: string;
  paid: number;
  refunded: number;
  total: number;
  paymentId: string | null;
  gps: string | null;
  mapsUrl: string | null;
  waybill: string | null;
  trackUrl: string | null;
  goods: Array<{ name: string; qty: number; batch: string | null; expiry: string | null; amount: number }>;
  deliveryCharge: number;
};

type Filter = "all" | "open" | "delivered" | "refunded" | "cancelled";

/** One status for the order, most important first. */
function orderState(o: OrderView, t?: FieldText) {
  const x = t?.orders;
  const stage = (s: string) => (t?.stages as Record<string, string> | undefined)?.[s] ?? s;
  if (o.status === "cancelled") return { key: "cancelled" as const, label: x?.stCancelled ?? "Cancelled", tone: "red" as const };
  if (o.refunded > 0 && o.refunded + 0.5 >= o.paid) return { key: "refunded" as const, label: x?.stRefunded ?? "Refunded", tone: "amber" as const };
  if (o.refunded > 0) return { key: "refunded" as const, label: x?.stPartRefunded ?? "Partly refunded", tone: "amber" as const };
  if (o.stage === "Delivered") return { key: "delivered" as const, label: stage("Delivered"), tone: "green" as const };
  if (o.stage) return { key: "open" as const, label: stage(o.stage), tone: "blue" as const };
  return { key: "open" as const, label: o.waybill ? (x?.stBooked ?? "Booked with Delhivery") : (x?.stToDispatch ?? "Paid · to dispatch"), tone: "lime" as const };
}

const TONES = {
  red: "bg-[#FBEAE8] text-[#8E3B34] ring-[#8E3B34]/15",
  amber: "bg-[#FFF4E0] text-[#8A5A00] ring-[#8A5A00]/15",
  green: "bg-[#E4F1DA] text-[#245B3E] ring-[#245B3E]/15",
  blue: "bg-[#E6EEF8] text-[#1F4E8C] ring-[#1F4E8C]/15",
  lime: "bg-[#EEF6CF] text-[#3E5E2F] ring-[#3E5E2F]/15",
};

function dateFmt(locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function phoneLabel(raw: string) {
  const d = raw.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : raw;
}

export function OrdersBoard({
  orders,
  canRefund,
  stats,
}: {
  orders: OrderView[];
  canRefund: boolean;
  stats: { todayCount: number; todayTotal: number; monthCount: number; monthTotal: number };
}) {
  const t = useFieldText();
  const x = t.orders;
  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: "all", label: x.filterAll },
    { key: "open", label: x.filterOpen },
    { key: "delivered", label: x.filterDelivered },
    { key: "refunded", label: x.filterRefunded },
    { key: "cancelled", label: x.filterCancelled },
  ];
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: orders.length, open: 0, delivered: 0, refunded: 0, cancelled: 0 };
    for (const o of orders) c[orderState(o).key] += 1;
    return c;
  }, [orders]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return orders.filter((o) => {
      if (filter !== "all" && orderState(o).key !== filter) return false;
      if (!q) return true;
      const text = [o.orderId, o.invoiceNo, o.farmerName, o.placedBy, o.paymentId, o.waybill, ...o.goods.map((g) => g.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q) || (digits.length >= 4 && o.farmerPhone.replace(/\D/g, "").includes(digits));
    });
  }, [orders, filter, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3E5E2F]">{x.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1E3317] sm:text-[28px]">{x.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-[#5E6B62]">{x.subtitle}</p>
        </div>
        <label className="relative block w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5E6B62]" aria-hidden />
          <span className="sr-only">{x.searchPh}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={x.searchPh}
            className="h-11 w-full rounded-xl border border-[#1E3317]/10 bg-white pl-9 pr-3 text-sm text-[#1E3317] shadow-sm outline-none placeholder:text-[#5E6B62]/70 focus:border-[#3E5E2F]/40 focus:ring-2 focus:ring-[#B8D94A]/40"
          />
        </label>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<ShoppingBag className="h-4 w-4" />} label={x.statToday} value={String(stats.todayCount)} sub={stats.todayCount === 1 ? x.order : x.orders} />
        <Stat icon={<Wallet className="h-4 w-4" />} label={x.statCollected} value={formatCurrency(stats.todayTotal)} sub={x.invoiceValue} />
        <Stat icon={<CalendarDays className="h-4 w-4" />} label={x.statMonth} value={String(stats.monthCount)} sub={stats.monthCount === 1 ? x.order : x.orders} />
        <Stat icon={<IndianRupee className="h-4 w-4" />} label={x.statMonthValue} value={formatCurrency(stats.monthTotal)} sub={x.invoiceValue} highlight />
      </section>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={x.title}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
                active
                  ? "bg-[#1E3317] text-white shadow-sm"
                  : "border border-[#1E3317]/10 bg-white text-[#3E5E2F] hover:border-[#1E3317]/25"
              }`}
            >
              {f.label}
              <span
                className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums ${
                  active ? "bg-[#B8D94A] text-[#1E3317]" : "bg-[#EDF2E7] text-[#3E5E2F]"
                }`}
              >
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1E3317]/15 bg-white px-6 py-14 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-[#3E5E2F]/60" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-[#1E3317]">
            {orders.length === 0 ? x.empty : x.noMatch}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[#5E6B62]">
            {orders.length === 0 ? x.emptyBody : x.noMatchBody}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((order) => (
            <OrderCard key={order.id} order={order} canRefund={canRefund} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        highlight ? "border-transparent bg-[#1E3317] text-white" : "border-[#1E3317]/10 bg-white text-[#1E3317]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            highlight ? "bg-[#B8D94A] text-[#1E3317]" : "bg-[#EDF2E7] text-[#3E5E2F]"
          }`}
        >
          {icon}
        </span>
        <p className={`text-xs font-semibold ${highlight ? "text-white/80" : "text-[#5E6B62]"}`}>{label}</p>
      </div>
      <p className="mt-3 text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{value}</p>
      <p className={`text-xs ${highlight ? "text-white/65" : "text-[#5E6B62]"}`}>{sub}</p>
    </div>
  );
}

function OrderCard({ order, canRefund }: { order: OrderView; canRefund: boolean }) {
  const t = useFieldText();
  const x = t.orders;
  const locale = fieldLocale(useFieldLang());
  const state = orderState(order, t);
  const cancelled = order.status === "cancelled";
  const goodsTotal = order.goods.reduce((sum, g) => sum + g.amount, 0);
  // Line amounts are before GST; the rest of the invoice total is GST (and any round-off).
  const gst = Math.max(0, Math.round((order.total - goodsTotal - order.deliveryCharge) * 100) / 100);

  return (
    <article className={`overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm ${cancelled ? "opacity-80" : ""}`}>
      <header className="flex flex-col gap-3 border-b border-[#1E3317]/8 bg-[#FAFBF7] px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-all font-mono text-[15px] font-semibold text-[#1E3317]">{order.orderId}</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${TONES[state.tone]}`}>
              {state.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#5E6B62]">{dateFmt(locale).format(new Date(order.date))}</p>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="sm:text-right">
          <p className="text-xs text-[#5E6B62]">{x.paid}</p>
          <p className={`text-lg font-bold tabular-nums ${cancelled ? "text-[#5E6B62] line-through" : "text-[#1E3317]"}`}>
            {formatCurrency(order.paid)}
          </p>
        </div>
        <Link
          href={`/invoices/${order.id}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1E3317]/10 bg-white px-3 text-xs font-semibold text-[#245B3E] hover:border-[#245B3E]/30 hover:bg-[#F4F8EF]"
        >
          {order.invoiceNo}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
        </div>
      </header>

      <div className="grid gap-0 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
        <section className="border-b border-[#1E3317]/8 px-5 py-4 md:border-b-0 md:border-r">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#5E6B62]">
            <Package className="h-3.5 w-3.5" aria-hidden /> {x.items}
            <span className="ml-auto font-normal normal-case tracking-normal">{x.beforeGst}</span>
          </p>
          {order.goods.length === 0 ? (
            <p className="mt-3 text-sm text-[#5E6B62]">{x.noLines}</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#1E3317]/8">
              {order.goods.map((g, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1E3317]">{g.name}</p>
                    <p className="mt-0.5 text-xs text-[#5E6B62]">
                      <span className="mr-2 inline-flex rounded-md bg-[#EDF2E7] px-1.5 py-px font-semibold text-[#3E5E2F]">× {g.qty}</span>
                      {[g.batch ? fmt(x.batch, { b: g.batch }) : "", g.expiry ? fmt(x.exp, { d: g.expiry }) : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-[#29332C]">{formatCurrency(g.amount)}</p>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-3 space-y-1.5 rounded-xl bg-[#F7F9F3] px-4 py-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#5E6B62]">{x.products}</dt>
              <dd className="tabular-nums text-[#29332C]">{formatCurrency(goodsTotal)}</dd>
            </div>
            {order.deliveryCharge > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-[#5E6B62]">{x.delivery}</dt>
                <dd className="tabular-nums text-[#29332C]">{formatCurrency(order.deliveryCharge)}</dd>
              </div>
            ) : null}
            {gst > 0.004 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-[#5E6B62]">{x.gst}</dt>
                <dd className="tabular-nums text-[#29332C]">{formatCurrency(gst)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-[#1E3317]/10 pt-1.5 font-semibold">
              <dt className="text-[#1E3317]">{x.invoiceTotal}</dt>
              <dd className="tabular-nums text-[#1E3317]">{formatCurrency(order.total)}</dd>
            </div>
          </dl>
        </section>

        <section className="space-y-4 px-5 py-4">
          <Info icon={<UserRound className="h-4 w-4" />} label={x.farmer}>
            <p className="font-semibold text-[#1E3317]">{order.farmerName || "—"}</p>
            {order.farmerPhone ? (
              <a href={`tel:+91${order.farmerPhone.replace(/\D/g, "").slice(-10)}`} className="inline-flex items-center gap-1 text-xs font-medium text-[#245B3E] hover:underline">
                <Phone className="h-3 w-3" aria-hidden />
                {phoneLabel(order.farmerPhone)}
              </a>
            ) : null}
            <p className="mt-0.5 text-xs text-[#5E6B62]">
              {order.placedBy ? fmt(x.byOfficer, { name: order.placedBy }) : x.byFarmer}
            </p>
          </Info>

          <Info icon={<CreditCard className="h-4 w-4" />} label={x.payment}>
            {order.paymentId ? <CopyText text={order.paymentId} /> : <p className="text-sm text-[#5E6B62]">{x.noPayment}</p>}
          </Info>

          <Info icon={<Truck className="h-4 w-4" />} label={x.deliveryInfo}>
            {order.trackUrl ? (
              <a href={order.trackUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#245B3E] hover:underline">
                Delhivery {order.waybill}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : (
              <p className="text-sm text-[#5E6B62]">{x.notBooked}</p>
            )}
            {order.stage ? <p className="text-xs text-[#5E6B62]">{fmt(x.latest, { s: (t.stages as Record<string, string>)[order.stage] ?? order.stage })}</p> : null}
          </Info>

          <Info icon={<MapPin className="h-4 w-4" />} label={x.where}>
            {order.mapsUrl ? (
              <a href={order.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-[#245B3E] hover:underline">
                {order.gps}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : (
              <p className="text-sm text-[#5E6B62]">{x.noLocation}</p>
            )}
          </Info>
        </section>
      </div>

      {canRefund ? (
        <footer className="border-t border-[#1E3317]/8 bg-[#FAFBF7] px-5 py-3">
          <OrderRefundPanel
            saleId={order.id}
            invoiceNo={order.invoiceNo}
            paid={order.paid}
            refunded={order.refunded}
            status={order.status}
            paymentId={order.paymentId}
          />
        </footer>
      ) : null}
    </article>
  );
}

function Info({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF2E7] text-[#3E5E2F]">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#5E6B62]">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function CopyText({ text }: { text: string }) {
  const t = useFieldText();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title={t.common.copy}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-md text-left font-mono text-xs text-[#1E3317] hover:text-[#245B3E]"
    >
      <span className="break-all">{text}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-[#245B3E]" aria-hidden /> : <Copy className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />}
      <span className="sr-only">{copied ? t.common.copied : t.common.copy}</span>
    </button>
  );
}
