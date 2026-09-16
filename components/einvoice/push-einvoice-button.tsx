"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateIrn, cancelIrn } from "@/lib/actions/einvoice";
import { Button } from "@/components/ui/button";

const CANCEL_WINDOW_HOURS = 24;

/** Hours left to cancel, or null once the window has closed (or there's no
 *  ack date to measure from — an older record predating this field). */
function cancelWindowHoursLeft(ackDate: string | null): number | null {
  if (!ackDate) return null;
  const ackMs = new Date(ackDate).getTime();
  if (Number.isNaN(ackMs)) return null;
  const deadlineMs = ackMs + CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
  const hoursLeft = (deadlineMs - Date.now()) / (60 * 60 * 1000);
  return hoursLeft > 0 ? hoursLeft : null;
}

export function PushEinvoiceButton({
  saleId,
  irn,
  einvoiceStatus,
  einvoiceError,
  ackDate,
}: {
  saleId: number;
  irn: string | null;
  einvoiceStatus: string;
  einvoiceError: string | null;
  /** ISO date string, so this stays a plain client-component prop. */
  ackDate?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(einvoiceError ?? "");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const hoursLeft = cancelWindowHoursLeft(ackDate ?? null);

  const push = () => {
    setError("");
    startTransition(async () => {
      try {
        await generateIrn(saleId);
        router.refresh();
      } catch (e) {
        // Next.js redacts a thrown Server Action error's real message in
        // production regardless of what's thrown — refreshing here too
        // means the actual reason (already persisted to einvoiceError
        // before the throw) shows via this row's status instead of being
        // silently lost behind whatever generic text reaches this catch.
        setError(e instanceof Error ? e.message : "Failed to push e-Invoice");
        router.refresh();
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
        router.refresh();
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
          ackDate && hoursLeft === null ? (
            <span className="text-[11px] text-slate-400">
              Cancel window closed (24h)
            </span>
          ) : (
            <button
              className="text-[11px] text-red-600 underline"
              onClick={() => setCancelling(true)}
            >
              {hoursLeft != null
                ? `Cancel (${hoursLeft.toFixed(1)}h left)`
                : "Cancel (within 24h only)"}
            </button>
          )
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
