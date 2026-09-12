"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateIrn, cancelIrn } from "@/lib/actions/einvoice";
import { Button } from "@/components/ui/button";

export function PushEinvoiceButton({
  saleId,
  irn,
  einvoiceStatus,
  einvoiceError,
}: {
  saleId: number;
  irn: string | null;
  einvoiceStatus: string;
  einvoiceError: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(einvoiceError ?? "");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const push = () => {
    setError("");
    startTransition(async () => {
      try {
        await generateIrn(saleId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to push e-Invoice");
      }
    });
  };

  const confirmCancel = () => {
    setError("");
    startTransition(async () => {
      try {
        await cancelIrn(saleId, reason);
        setCancelling(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to cancel IRN");
      }
    });
  };

  if (irn && einvoiceStatus !== "cancelled") {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
          IRN {irn.slice(0, 10)}…
        </span>
        {!cancelling ? (
          <button
            className="text-[11px] text-red-600 underline"
            onClick={() => setCancelling(true)}
          >
            Cancel (within 24h only)
          </button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <input
              className="w-40 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
              placeholder="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700"
                disabled={isPending || reason.trim().length < 3}
                onClick={confirmCancel}
              >
                {isPending ? "…" : "Confirm"}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={push} disabled={isPending}>
        {isPending ? "Pushing…" : einvoiceStatus === "failed" ? "Retry" : "Push e-Invoice"}
      </Button>
      {error && <p className="max-w-[220px] text-right text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
