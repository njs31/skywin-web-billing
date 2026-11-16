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
      <p className="text-sm text-[#8E3B34]">
        Cancelled
        {refunded > 0 ? ` · refunded ${formatCurrency(refunded)} through Razorpay` : ""}
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

  return (
    <div className="space-y-2">
      <p className="text-sm text-[#29332C]">
        {refunded > 0 ? `Refunded ${formatCurrency(refunded)} · ` : ""}
        {left > 0 ? `${formatCurrency(left)} left to refund` : "Nothing left to refund"}
      </p>
      {paymentId ? null : (
        <p className="text-xs text-[#5E6B62]">No Razorpay payment is stored, so this order cannot be refunded.</p>
      )}
      {error ? (
        <p role="alert" className="text-xs text-[#8E3B34]">
          {error}
        </p>
      ) : null}
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {paymentId && left >= 1 ? (
            <button
              type="button"
              className="h-8 rounded-md border border-[#1E3317]/15 bg-white px-3 text-xs font-medium text-[#1E3317]"
              onClick={() => {
                setError("");
                setMode("refund");
              }}
            >
              Partial refund
            </button>
          ) : null}
          <button
            type="button"
            className="h-8 rounded-md border border-[#8E3B34]/30 bg-white px-3 text-xs font-medium text-[#8E3B34]"
            onClick={() => {
              setError("");
              setMode("cancel");
            }}
          >
            Cancel order
          </button>
        </div>
      ) : null}
      {mode === "refund" ? (
        <form
          className="space-y-2 rounded-md border border-[#1E3317]/10 bg-[#F7F6F1] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => refundFieldOrder(saleId, amount, reason));
          }}
        >
          <p className="text-xs text-[#5E6B62]">
            Razorpay refunds this amount to the original payment. {invoiceNo} stays active.
          </p>
          <label className="block text-xs text-[#5E6B62]" htmlFor={`refund-amount-${saleId}`}>
            Amount (₹)
            <input
              id={`refund-amount-${saleId}`}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-[#1E3317]/15 bg-white px-2 text-sm text-[#1E3317]"
            />
          </label>
          <label className="block text-xs text-[#5E6B62]" htmlFor={`refund-reason-${saleId}`}>
            Reason
            <input
              id={`refund-reason-${saleId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-[#1E3317]/15 bg-white px-2 text-sm text-[#1E3317]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || reason.trim().length < 3 || !amount.trim()}
              className="h-8 rounded-md bg-[#1E3317] px-3 text-xs font-medium text-white disabled:opacity-40"
            >
              {pending ? "Refunding…" : "Refund through Razorpay"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-8 rounded-md px-3 text-xs font-medium text-[#5E6B62]"
              onClick={() => setMode("idle")}
            >
              Back
            </button>
          </div>
        </form>
      ) : null}
      {mode === "cancel" ? (
        <form
          className="space-y-2 rounded-md border border-[#8E3B34]/20 bg-white p-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => cancelSale(saleId, cancelReason));
          }}
        >
          <p className="text-xs text-[#5E6B62]">
            {paymentId && left > 0
              ? `Razorpay refunds the remaining ${formatCurrency(left)}, then ${invoiceNo} is cancelled and the stock goes back.`
              : `${invoiceNo} is cancelled and the stock goes back.`}
          </p>
          <label className="block text-xs text-[#5E6B62]" htmlFor={`cancel-reason-${saleId}`}>
            Reason
            <input
              id={`cancel-reason-${saleId}`}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-[#1E3317]/15 bg-white px-2 text-sm text-[#1E3317]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || cancelReason.trim().length < 3}
              className="h-8 rounded-md bg-[#8E3B34] px-3 text-xs font-medium text-white disabled:opacity-40"
            >
              {pending ? "Cancelling…" : "Cancel and refund"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-8 rounded-md px-3 text-xs font-medium text-[#5E6B62]"
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
