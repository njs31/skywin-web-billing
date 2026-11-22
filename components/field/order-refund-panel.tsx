"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundFieldOrder } from "@/lib/actions/field";
import { cancelSale } from "@/lib/actions/sales";
import { formatCurrency } from "@/lib/utils";
import { useFieldText } from "@/components/field/lang";
import { fmt } from "@/lib/field-i18n";

export function OrderRefundPanel({
  saleId,
  invoiceNo,
  paid,
  refunded,
  status,
  paymentId,
}: {
  saleId: number;
  invoiceNo: string;
  paid: number;
  refunded: number;
  status: string;
  paymentId: string | null;
}) {
  const router = useRouter();
  const ft = useFieldText();
  const x = ft.orders;
  const back = ft.common.back;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"idle" | "refund" | "cancel">("idle");
  const [pending, start] = useTransition();
  const cancelled = status === "cancelled";
  const left = Math.max(0, Math.round((paid - refunded) * 100) / 100);

  if (cancelled) {
    return (
      <p className="text-sm font-medium text-[#8E3B34]">
        {x.cancelledNote}
        {refunded > 0 ? fmt(x.refundedThrough, { amount: formatCurrency(refunded) }) : ""}
      </p>
    );
  }

  function run(action: () => Promise<unknown>) {
    setError("");
    start(async () => {
      try {
        await action();
        setMode("idle");
        setAmount("");
        setReason("");
        setCancelReason("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : x.refundFailed);
      }
    });
  }

  const field =
    "mt-1 h-10 w-full rounded-lg border border-[#1E3317]/15 bg-white px-3 text-sm text-[#1E3317] outline-none focus:border-[#3E5E2F]/40 focus:ring-2 focus:ring-[#B8D94A]/40";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-semibold text-[#1E3317]">
            {left > 0 ? fmt(x.refundable, { amount: formatCurrency(left) }) : x.fullyRefunded}
          </span>
          {refunded > 0 ? <span className="text-[#5E6B62]">{fmt(x.refundedSoFar, { amount: formatCurrency(refunded) })}</span> : null}
          {paymentId ? null : (
            <span className="block text-xs text-[#5E6B62]">{x.noRazorpay}</span>
          )}
        </div>
        {mode === "idle" ? (
          <div className="flex flex-wrap gap-2">
            {paymentId && left >= 1 ? (
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-lg border border-[#1E3317]/15 bg-white px-4 text-sm font-semibold text-[#1E3317] hover:border-[#1E3317]/30 hover:bg-[#F4F8EF]"
                onClick={() => {
                  setError("");
                  setAmount("");
                  setMode("refund");
                }}
              >
                {x.partialRefund}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-lg border border-[#8E3B34]/25 bg-white px-4 text-sm font-semibold text-[#8E3B34] hover:bg-[#FBEAE8]"
              onClick={() => {
                setError("");
                setMode("cancel");
              }}
            >
              {x.cancelOrder}
            </button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-[#FBEAE8] px-3 py-2 text-sm text-[#8E3B34]">
          {error}
        </p>
      ) : null}
      {mode === "refund" ? (
        <form
          className="grid gap-3 rounded-xl border border-[#1E3317]/10 bg-white p-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => refundFieldOrder(saleId, amount, reason));
          }}
        >
          <p className="text-xs text-[#5E6B62] sm:col-span-3">
            {fmt(x.refundHelp, { invoice: invoiceNo })}
          </p>
          <label className="block text-xs font-semibold text-[#5E6B62]" htmlFor={`refund-amount-${saleId}`}>
            {fmt(x.amountUpTo, { amount: formatCurrency(left) })}
            <input
              id={`refund-amount-${saleId}`}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className={field}
            />
          </label>
          <label className="block text-xs font-semibold text-[#5E6B62]" htmlFor={`refund-reason-${saleId}`}>
            {x.reason}
            <input
              id={`refund-reason-${saleId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={x.reasonRefundPh}
              className={field}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || reason.trim().length < 3 || !amount.trim()}
              className="h-10 rounded-lg bg-[#1E3317] px-4 text-sm font-semibold text-white hover:bg-[#2E4A22] disabled:opacity-40"
            >
              {pending ? x.refunding : x.refund}
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-[#5E6B62] hover:bg-[#F4F8EF]"
              onClick={() => setMode("idle")}
            >
              {back}
            </button>
          </div>
        </form>
      ) : null}
      {mode === "cancel" ? (
        <form
          className="grid gap-3 rounded-xl border border-[#8E3B34]/20 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => cancelSale(saleId, cancelReason));
          }}
        >
          <p className="text-xs text-[#5E6B62] sm:col-span-2">
            {paymentId && left > 0
              ? fmt(x.cancelHelpRefund, { amount: formatCurrency(left), invoice: invoiceNo })
              : fmt(x.cancelHelp, { invoice: invoiceNo })}
          </p>
          <label className="block text-xs font-semibold text-[#5E6B62]" htmlFor={`cancel-reason-${saleId}`}>
            {x.reason}
            <input
              id={`cancel-reason-${saleId}`}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder={x.reasonCancelPh}
              className={field}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || cancelReason.trim().length < 3}
              className="h-10 rounded-lg bg-[#8E3B34] px-4 text-sm font-semibold text-white hover:bg-[#7A322C] disabled:opacity-40"
            >
              {pending ? x.cancelling : x.cancelAndRefund}
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-[#5E6B62] hover:bg-[#F4F8EF]"
              onClick={() => setMode("idle")}
            >
              {back}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
