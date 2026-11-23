"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundFieldOrder } from "@/lib/actions/field";
import { cancelSale } from "@/lib/actions/sales";
import { formatCurrency } from "@/lib/utils";
import { buttonClass, inputClass, labelClass } from "@/components/shipping/ui";

/**
 * Refund part of an order, or cancel it (which refunds what is left and returns the stock).
 * Both go through Razorpay; the farmer's app shows the refund or cancellation.
 */
export function OrderActions({
  saleId,
  invoiceNo,
  paid,
  refunded,
  status,
  paymentId,
  onDone,
}: {
  saleId: number;
  invoiceNo: string;
  paid: number;
  refunded: number;
  status: string;
  paymentId: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "refund" | "cancel">("idle");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const left = Math.max(0, Math.round((paid - refunded) * 100) / 100);

  if (status === "cancelled") {
    return (
      <p className="text-sm text-slate-600">
        This order is cancelled{refunded > 0 ? ` and ${formatCurrency(refunded)} was refunded to the farmer` : ""}.
      </p>
    );
  }

  const run = (action: () => Promise<unknown>, message: string) => {
    setError("");
    start(async () => {
      try {
        await action();
        setMode("idle");
        setAmount("");
        setReason("");
        setDone(message);
        router.refresh();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not go through. Try again.");
      }
    });
  };

  const amountNum = Number(amount);
  const amountOk = Number.isFinite(amountNum) && amountNum >= 1 && amountNum <= left;

  return (
    <div className="space-y-3">
      {mode === "idle" ? (
        <>
          <p className="text-sm text-slate-600">
            {left > 0 ? (
              <>
                <span className="font-medium text-slate-900">{formatCurrency(left)}</span> can still be refunded
                {refunded > 0 ? ` (${formatCurrency(refunded)} refunded so far)` : ""}.
              </>
            ) : (
              "The full amount has been refunded."
            )}
            {paymentId ? null : " This order has no Razorpay payment, so nothing is refunded automatically."}
          </p>
          <div className="flex flex-wrap gap-2">
            {paymentId && left >= 1 ? (
              <button type="button" className={buttonClass("secondary")} onClick={() => { setDone(""); setError(""); setMode("refund"); }}>
                Refund part
              </button>
            ) : null}
            <button type="button" className={buttonClass("danger")} onClick={() => { setDone(""); setError(""); setMode("cancel"); }}>
              Cancel order
            </button>
          </div>
        </>
      ) : null}

      {mode === "refund" ? (
        <form
          className="space-y-3 rounded-lg border border-slate-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => refundFieldOrder(saleId, amount, reason), `Refund of ${formatCurrency(amountNum)} sent through Razorpay.`);
          }}
        >
          <p className="text-sm font-medium text-slate-900">Refund part of {invoiceNo}</p>
          <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <label className="block">
              <span className={labelClass}>Amount (up to {formatCurrency(left)})</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputClass + " tabular-nums"} autoFocus />
            </label>
            <label className="block">
              <span className={labelClass}>Reason</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. one item out of stock" className={inputClass} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("ghost")} disabled={pending} onClick={() => setMode("idle")}>
              Back
            </button>
            <button type="submit" className={buttonClass("primary")} disabled={pending || !amountOk || reason.trim().length < 3}>
              {pending ? "Refunding…" : amountOk ? `Refund ${formatCurrency(amountNum)}` : "Refund"}
            </button>
          </div>
        </form>
      ) : null}

      {mode === "cancel" ? (
        <form
          className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => cancelSale(saleId, reason), "Order cancelled. The farmer is refunded and the stock is back.");
          }}
        >
          <p className="text-sm font-medium text-slate-900">Cancel {invoiceNo}?</p>
          <p className="text-sm text-slate-600">
            {paymentId && left > 0
              ? `${formatCurrency(left)} goes back to the farmer's UPI account and the items return to stock.`
              : "The items return to stock. The invoice stays on record as cancelled."}
          </p>
          <label className="block">
            <span className={labelClass}>Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. farmer asked to cancel" className={inputClass} autoFocus />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("ghost")} disabled={pending} onClick={() => setMode("idle")}>
              Keep order
            </button>
            <button
              type="submit"
              disabled={pending || reason.trim().length < 3}
              className={buttonClass("primary") + " bg-rose-700 hover:bg-rose-800"}
            >
              {pending ? "Cancelling…" : "Cancel and refund"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {done}
        </p>
      ) : null}
    </div>
  );
}
