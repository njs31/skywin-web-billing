"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundFieldOrder } from "@/lib/actions/field";
import { cancelSale } from "@/lib/actions/sales";
import { formatCurrency } from "@/lib/utils";

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
        Order cancelled
        {refunded > 0 ? ` · ${formatCurrency(refunded)} refunded through Razorpay` : ""}
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
        setError(err instanceof Error ? err.message : "Could not refund this order");
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
            {left > 0 ? `${formatCurrency(left)} refundable` : "Fully refunded"}
          </span>
          {refunded > 0 ? <span className="text-[#5E6B62]"> · {formatCurrency(refunded)} refunded so far</span> : null}
          {paymentId ? null : (
            <span className="block text-xs text-[#5E6B62]">No Razorpay payment stored, so this order can&apos;t be refunded online.</span>
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
                Partial refund
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
              Cancel order
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
            Razorpay sends this amount back to the customer&apos;s original payment. {invoiceNo} stays active.
          </p>
          <label className="block text-xs font-semibold text-[#5E6B62]" htmlFor={`refund-amount-${saleId}`}>
            Amount (₹, up to {formatCurrency(left)})
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
            Reason
            <input
              id={`refund-reason-${saleId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. one item damaged"
              className={field}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || reason.trim().length < 3 || !amount.trim()}
              className="h-10 rounded-lg bg-[#1E3317] px-4 text-sm font-semibold text-white hover:bg-[#2E4A22] disabled:opacity-40"
            >
              {pending ? "Refunding…" : "Refund"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-[#5E6B62] hover:bg-[#F4F8EF]"
              onClick={() => setMode("idle")}
            >
              Back
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
              ? `Razorpay refunds the remaining ${formatCurrency(left)}, then ${invoiceNo} is cancelled and the stock goes back.`
              : `${invoiceNo} is cancelled and the stock goes back.`}
          </p>
          <label className="block text-xs font-semibold text-[#5E6B62]" htmlFor={`cancel-reason-${saleId}`}>
            Reason
            <input
              id={`cancel-reason-${saleId}`}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="e.g. customer asked to cancel"
              className={field}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || cancelReason.trim().length < 3}
              className="h-10 rounded-lg bg-[#8E3B34] px-4 text-sm font-semibold text-white hover:bg-[#7A322C] disabled:opacity-40"
            >
              {pending ? "Cancelling…" : "Cancel and refund"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-[#5E6B62] hover:bg-[#F4F8EF]"
              onClick={() => setMode("idle")}
            >
              Back
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
