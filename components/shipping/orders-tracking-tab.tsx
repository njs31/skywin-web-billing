"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DELIVERY_STEPS,
  STEP_SHORT,
  isDelhiveryWaybill,
  isDeliveryStep,
  nextStep,
  stepIndex,
  type DeliveryStep,
} from "@/lib/order-status";
import {
  EmptyState,
  SearchInput,
  SidePanel,
  StatusBadge,
  StepBar,
  StepTimeline,
  buttonClass,
  formatPhone,
  inputClass,
  labelClass,
  telHref,
} from "@/components/shipping/ui";

export type DispatchEvent = {
  id: number;
  checkpoint: string;
  note: string | null;
  location: string | null;
  updatedBy: string | null;
  createdAt: string;
};

export type DispatchOrder = {
  id: number;
  orderId: string;
  invoiceNo: string | null;
  date: string;
  farmerName: string;
  farmerPhone: string;
  /** Coordinates saved when the order was placed, if any. */
  gps: string | null;
  total: number;
  paid: number;
  refunded: number;
  cancelled: boolean;
  waybill: string | null;
  /** Newest first. */
  history: DispatchEvent[];
  items: Array<{ name: string; qty: number }>;
};

type Filter = "all" | DeliveryStep | "closed";

/** Where the order is in the app's stepper. Paid orders start at "Order Received". */
function stageOf(o: DispatchOrder): DeliveryStep {
  const latest = o.history.find((h) => isDeliveryStep(h.checkpoint));
  return latest && isDeliveryStep(latest.checkpoint) ? latest.checkpoint : "Order Received";
}

/** Cancelled or fully refunded: nothing to ship. */
function isClosed(o: DispatchOrder) {
  return o.cancelled || (o.refunded > 0 && o.refunded + 0.5 >= o.paid);
}

function when(iso: string) {
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

export function OrdersTrackingTab({ initialOrders, isAdmin }: { initialOrders: DispatchOrder[]; isAdmin: boolean }) {
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<{ id: number; step: DeliveryStep | null } | null>(null);
  const close = useCallback(() => setPanel(null), []);

  const rows = useMemo(() => orders.map((o) => ({ o, stage: stageOf(o), closed: isClosed(o) })), [orders]);

  const counts = useMemo(() => {
    const c = Object.fromEntries([...DELIVERY_STEPS, "closed", "all"].map((k) => [k, 0])) as Record<Filter, number>;
    for (const r of rows) {
      c.all += 1;
      c[r.closed ? "closed" : r.stage] += 1;
    }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return rows.filter(({ o, stage, closed }) => {
      if (filter === "closed" && !closed) return false;
      if (filter !== "all" && filter !== "closed" && (closed || stage !== filter)) return false;
      if (!q) return true;
      const text = [o.orderId, o.invoiceNo, o.farmerName, o.waybill, ...o.items.map((i) => i.name)].filter(Boolean).join(" ").toLowerCase();
      return text.includes(q) || (digits.length >= 4 && o.farmerPhone.replace(/\D/g, "").includes(digits));
    });
  }, [rows, filter, query]);

  const open = panel ? rows.find((r) => r.o.id === panel.id) ?? null : null;

  const recorded = (orderId: string, event: DispatchEvent) =>
    setOrders((prev) => prev.map((o) => (o.orderId === orderId ? { ...o, history: [event, ...o.history] } : o)));

  return (
    <div className="space-y-4">
      {/* The app's stepper as a pipeline: how many orders sit at each step. */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div role="tablist" aria-label="Delivery step" className="grid min-w-[760px] grid-cols-8 divide-x divide-slate-200">
          {(["all", ...DELIVERY_STEPS, "closed"] as Filter[]).map((k) => {
            const on = filter === k;
            const label = k === "all" ? "All orders" : k === "closed" ? "Cancelled" : STEP_SHORT[k];
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(k)}
                className={cn(
                  "relative px-3 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50",
                  on && "bg-slate-50"
                )}
              >
                <span className={cn("block text-xl font-semibold tabular-nums", counts[k] === 0 ? "text-slate-300" : "text-slate-900")}>{counts[k]}</span>
                <span className={cn("mt-0.5 block truncate text-xs", on ? "font-medium text-slate-900" : "text-slate-500")}>{label}</span>
                {on ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-700" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          {filter === "all"
            ? "Newest first. Open an order to see its history or move it to the next step."
            : filter === "closed"
              ? "Cancelled or fully refunded orders. Nothing to ship."
              : `Orders at “${STEP_SHORT[filter as DeliveryStep]}”.`}
        </p>
        <SearchInput value={query} onChange={setQuery} placeholder="Order, farmer, phone, waybill…" className="w-full sm:w-72" />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {shown.length === 0 ? (
          <EmptyState
            title={orders.length === 0 ? "No orders to dispatch" : "Nothing here"}
            body={orders.length === 0 ? "Paid orders from the app show up here." : "No orders match this step or search."}
          />
        ) : (
          <>
            <table className="hidden w-full text-sm xl:table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Farmer</th>
                  <th className="px-4 py-2.5 font-medium">Items</th>
                  <th className="px-4 py-2.5 font-medium">Step</th>
                  <th className="px-4 py-2.5 font-medium">Last update</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ o, stage, closed }) => {
                  const next = closed ? null : nextStep(stage);
                  const last = o.history[0];
                  return (
                    <tr key={o.id} className={cn("border-t border-slate-100 align-top", closed && "text-slate-500")}>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setPanel({ id: o.id, step: null })}
                          className="text-left font-mono text-[13px] font-medium text-slate-900 hover:text-emerald-800 hover:underline focus-visible:outline-none focus-visible:underline"
                        >
                          {o.orderId}
                        </button>
                        <p className="mt-0.5 text-xs tabular-nums text-slate-500">{when(o.date)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{o.farmerName || "—"}</p>
                        <p className="text-xs tabular-nums text-slate-500">{formatPhone(o.farmerPhone) || "—"}</p>
                      </td>
                      <td className="max-w-[16rem] px-4 py-3">
                        <p className="truncate text-slate-700">{itemsText(o.items)}</p>
                        <p className="text-xs tabular-nums text-slate-500">{formatCurrency(o.total)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StageBadge stage={stage} order={o} closed={closed} />
                        <div className="mt-1.5">
                          <StepBar stage={stage} muted={closed} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {last ? (
                          <>
                            <p className="tabular-nums">{when(last.createdAt)}</p>
                            {last.location ? <p className="max-w-[12rem] truncate">{last.location}</p> : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {next ? (
                          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setPanel({ id: o.id, step: next })}>
                            Mark {STEP_SHORT[next].toLowerCase()}
                          </button>
                        ) : (
                          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setPanel({ id: o.id, step: null })}>
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <ul className="divide-y divide-slate-100 xl:hidden">
              {shown.map(({ o, stage, closed }) => {
                const next = closed ? null : nextStep(stage);
                return (
                  <li key={o.id} className="px-4 py-3.5">
                    <button type="button" className="block w-full text-left" onClick={() => setPanel({ id: o.id, step: null })}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-medium text-slate-900">{o.farmerName || "—"}</p>
                        <p className="shrink-0 text-sm tabular-nums text-slate-700">{formatCurrency(o.total)}</p>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                        {o.orderId} · <span className="font-sans">{when(o.date)}</span>
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-600">{itemsText(o.items)}</p>
                    </button>
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <StageBadge stage={stage} order={o} closed={closed} />
                        <span className="hidden sm:block">
                          <StepBar stage={stage} muted={closed} />
                        </span>
                      </div>
                      {next ? (
                        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setPanel({ id: o.id, step: next })}>
                          Mark {STEP_SHORT[next].toLowerCase()}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <SidePanel
        open={!!open}
        onClose={close}
        title={open ? <span className="font-mono">{open.o.orderId}</span> : null}
        subtitle={open ? `${open.o.farmerName || "Farmer"} · ${formatCurrency(open.o.total)} · ${when(open.o.date)}` : null}
      >
        {open ? (
          <DispatchDetail
            key={`${open.o.id}-${panel?.step ?? ""}`}
            order={open.o}
            stage={open.stage}
            closed={open.closed}
            initialStep={panel?.step ?? null}
            isAdmin={isAdmin}
            onRecorded={recorded}
          />
        ) : null}
      </SidePanel>
    </div>
  );
}

function itemsText(items: DispatchOrder["items"]) {
  if (items.length === 0) return "—";
  const first = `${items[0].name} × ${items[0].qty}`;
  return items.length > 1 ? `${first} · +${items.length - 1} more` : first;
}

function StageBadge({ stage, order, closed }: { stage: DeliveryStep; order: DispatchOrder; closed: boolean }) {
  if (order.cancelled) return <StatusBadge tone="red">Cancelled</StatusBadge>;
  if (closed) return <StatusBadge tone="amber">Refunded</StatusBadge>;
  if (stage === "Delivered") return <StatusBadge tone="green">Delivered</StatusBadge>;
  if (stepIndex(stage) >= 2) return <StatusBadge tone="blue">{STEP_SHORT[stage]}</StatusBadge>;
  return <StatusBadge tone="neutral">{STEP_SHORT[stage]}</StatusBadge>;
}

function DispatchDetail({
  order,
  stage,
  closed,
  initialStep,
  isAdmin,
  onRecorded,
}: {
  order: DispatchOrder;
  stage: DeliveryStep;
  closed: boolean;
  initialStep: DeliveryStep | null;
  isAdmin: boolean;
  onRecorded: (orderId: string, event: DispatchEvent) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<DeliveryStep | null>(initialStep ?? nextStep(stage));
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const trackUrl = order.waybill && isDelhiveryWaybill(order.waybill) ? `https://www.delhivery.com/track-v2/package/${encodeURIComponent(order.waybill)}` : null;
  const at = stepIndex(stage);

  const save = () => {
    if (!step || pending) return;
    setResult(null);
    start(async () => {
      try {
        const res = await fetch("/api/shipping/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.orderId,
            saleId: order.id,
            checkpoint: step,
            note: note.trim() || undefined,
            location: location.trim() || undefined,
            updatedBy: "Shipping office",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not save the step.");
        onRecorded(order.orderId, {
          id: data.checkpoint?.id ?? Date.now(),
          checkpoint: step,
          note: note.trim() || null,
          location: location.trim() || null,
          updatedBy: "Shipping office",
          createdAt: data.checkpoint?.createdAt ?? new Date().toISOString(),
        });
        setResult({ ok: true, text: `Marked “${STEP_SHORT[step]}”. ${order.farmerName || "The farmer"} has been notified in the app.` });
        setStep(nextStep(step));
        setLocation("");
        setNote("");
        router.refresh();
      } catch (err) {
        setResult({ ok: false, text: err instanceof Error ? err.message : "Could not save the step." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
          {telHref(order.farmerPhone) ? (
            <a href={telHref(order.farmerPhone)} className="tabular-nums text-emerald-800 hover:underline">
              {formatPhone(order.farmerPhone)}
            </a>
          ) : null}
          {order.gps ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.gps)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-800 hover:underline"
            >
              Ordered at {order.gps}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
          {trackUrl ? (
            <a href={trackUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-800 hover:underline">
              Delhivery {order.waybill}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {order.items.length === 0 ? <li className="px-3.5 py-2.5 text-slate-500">No item lines.</li> : null}
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 px-3.5 py-2">
              <span className="text-slate-800">{it.name}</span>
              <span className="shrink-0 tabular-nums text-slate-500">× {it.qty}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">What the farmer sees</h3>
        <StepTimeline stage={stage} history={order.history} cancelled={closed} />
      </section>

      {closed ? (
        <p className="rounded-lg bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
          {order.cancelled ? "This order is cancelled" : "This order is fully refunded"}, so there is nothing to ship.
        </p>
      ) : (
        <section className="space-y-4 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-medium text-slate-900">Update the step</h3>
          <div role="radiogroup" aria-label="Delivery step" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {DELIVERY_STEPS.map((s, i) => {
              const on = step === s;
              const done = i <= at;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setStep(s)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40",
                    on ? "border-emerald-700 bg-emerald-50 font-medium text-emerald-900" : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-label="done" />
                  ) : (
                    <span className="w-3.5 shrink-0 text-center text-[11px] tabular-nums text-slate-400">{i + 1}</span>
                  )}
                  <span className="truncate">{STEP_SHORT[s]}</span>
                </button>
              );
            })}
          </div>
          {step && stepIndex(step) <= at ? (
            <p className="text-xs text-amber-700">“{STEP_SHORT[step]}” is already done. Saving it again sends the farmer another notification.</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Where is it now? (optional)</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Kumbakonam hub" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Note for the farmer (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Driver Ramesh, 98421 00000" className={inputClass} />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">The farmer gets a notification and sees this step in the app.</p>
            <button type="button" className={buttonClass("primary")} disabled={!step || pending} onClick={save}>
              {pending ? "Saving…" : step ? `Mark ${STEP_SHORT[step].toLowerCase()} and notify` : "Delivered"}
            </button>
          </div>
          {result ? (
            <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>
              {result.text}
            </p>
          ) : null}
        </section>
      )}

      {order.history.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Activity</h3>
          <ul className="space-y-2 text-sm">
            {order.history.map((h) => (
              <li key={h.id} className="flex gap-3">
                <span className="w-28 shrink-0 text-xs tabular-nums text-slate-500">{when(h.createdAt)}</span>
                <span className="min-w-0 text-slate-700">
                  {isDeliveryStep(h.checkpoint) ? STEP_SHORT[h.checkpoint] : h.checkpoint}
                  {h.location ? <span className="text-slate-500"> · {h.location}</span> : null}
                  {h.note ? <span className="block text-xs text-slate-500">{h.note}</span> : null}
                  {h.updatedBy ? <span className="block text-xs text-slate-400">by {h.updatedBy}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isAdmin && !closed ? (
        <p className="text-sm text-slate-500">
          To cancel or refund, use{" "}
          <Link href="/field-orders" className="font-medium text-emerald-800 hover:underline">
            Orders
          </Link>{" "}
          so the money goes back to the farmer and the stock returns.
        </p>
      ) : null}
    </div>
  );
}
