"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateEwb, updateDispatchDetails, cancelEwb } from "@/lib/actions/einvoice";
import { Button } from "@/components/ui/button";

/** Hours until expiry, or null if there's no valid-until date to measure. */
function hoursUntilExpiry(validUntilIso: string | null): number | null {
  if (!validUntilIso) return null;
  const ms = new Date(validUntilIso).getTime();
  if (Number.isNaN(ms)) return null;
  return (ms - Date.now()) / (60 * 60 * 1000);
}

const CANCEL_WINDOW_HOURS = 24;

/** Hours left in the e-way bill's cancellation window (24h from
 *  generation — distinct from transport validity), or null once it's
 *  closed or there's no generation timestamp to measure from. */
function cancelWindowHoursLeft(generatedAtIso: string | null): number | null {
  if (!generatedAtIso) return null;
  const ms = new Date(generatedAtIso).getTime();
  if (Number.isNaN(ms)) return null;
  const deadlineMs = ms + CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
  const hoursLeft = (deadlineMs - Date.now()) / (60 * 60 * 1000);
  return hoursLeft > 0 ? hoursLeft : null;
}

export function GenerateEwbButton({
  saleId,
  ewbId,
  ewbNo,
  ewbStatus,
  ewbValidUntil,
  ewbValidUntilIso,
  ewbGeneratedAtIso,
  ewbError,
  vehicleNo,
  transporterName: prefilledTransporterName,
  distanceKm: prefilledDistanceKm,
}: {
  saleId: number;
  /** Zoho's internal ewaybill_id — needed to cancel; the e-way bill NUMBER
   *  (ewbNo) is a different, government-facing value. */
  ewbId?: string | null;
  ewbNo: string | null;
  ewbStatus: string;
  /** Display-formatted "valid till" text. */
  ewbValidUntil: string | null;
  /** Same date as ewbValidUntil, but as an ISO string, for the expiry
   *  countdown — kept separate so the display formatting stays server-side. */
  ewbValidUntilIso?: string | null;
  /** When the e-way bill was generated, as an ISO string — for the 24h
   *  cancellation-window countdown, distinct from transport validity. */
  ewbGeneratedAtIso?: string | null;
  ewbError: string | null;
  /** Dispatch details already captured at billing time, if any — when
   *  vehicle, transporter and distance are all present, this button skips
   *  the manual form and pushes in one click. */
  vehicleNo?: string | null;
  transporterName?: string | null;
  distanceKm?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(ewbError ?? "");
  const [vehicleNumber, setVehicleNumber] = useState(vehicleNo ?? "");
  const [transporterName, setTransporterName] = useState(
    prefilledTransporterName ?? ""
  );
  const [distanceKm, setDistanceKm] = useState(prefilledDistanceKm ?? "");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const readyForOneClick = Boolean(
    vehicleNo?.trim() && prefilledTransporterName?.trim() && prefilledDistanceKm
  );

  const push = (dispatch?: {
    vehicleNumber?: string;
    transporterName?: string;
    distanceKm?: number;
  }) => {
    setError("");
    startTransition(async () => {
      try {
        // Omitting dispatch (the one-click path) lets generateEwb fall back
        // to whatever's already stored on the sale from billing time.
        await generateEwb(saleId, dispatch);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate e-Way Bill");
      }
    });
  };

  const formDispatch = {
    vehicleNumber: vehicleNumber.trim() || undefined,
    transporterName: transporterName.trim() || undefined,
    distanceKm: distanceKm.trim() ? Number(distanceKm) : undefined,
  };
  const submitForm = () => push(formDispatch);

  /** Save the entered details without pushing — for fixing a "missing
   *  details" invoice ahead of time, e.g. at the end of a shift, without
   *  necessarily pushing to the government right away. */
  const saveOnly = () => {
    setError("");
    startTransition(async () => {
      try {
        await updateDispatchDetails(saleId, formDispatch);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save details");
      }
    });
  };

  const confirmCancel = () => {
    setError("");
    startTransition(async () => {
      try {
        await cancelEwb(saleId, cancelReason);
        setCancelling(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to cancel e-Way Bill");
      }
    });
  };

  if (ewbNo && ewbStatus !== "cancelled") {
    const hoursLeft = hoursUntilExpiry(ewbValidUntilIso ?? null);
    const expired = hoursLeft != null && hoursLeft <= 0;
    const expiringSoon = hoursLeft != null && hoursLeft > 0 && hoursLeft <= 24;
    const cancelHoursLeft = cancelWindowHoursLeft(ewbGeneratedAtIso ?? null);
    const cancelWindowClosed = Boolean(ewbGeneratedAtIso) && cancelHoursLeft === null;

    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
          EWB {ewbNo}
        </span>
        {ewbValidUntil && (
          <span
            className={
              expired
                ? "text-[10px] font-semibold text-red-600"
                : expiringSoon
                  ? "text-[10px] font-semibold text-amber-600"
                  : "text-[10px] text-slate-500"
            }
          >
            {expired
              ? `Expired ${ewbValidUntil}`
              : expiringSoon
                ? `Expires soon — ${ewbValidUntil}`
                : `valid till ${ewbValidUntil}`}
          </span>
        )}
        {!cancelling ? (
          cancelWindowClosed ? (
            <span className="text-[10px] text-slate-400">
              Cancel window closed (24h)
            </span>
          ) : (
            <button
              className="text-[10px] text-red-600 underline"
              onClick={() => setCancelling(true)}
              disabled={!ewbId}
              title={!ewbId ? "No Zoho e-way bill id on file for this invoice" : undefined}
            >
              {cancelHoursLeft != null
                ? `Cancel (${cancelHoursLeft.toFixed(1)}h left)`
                : "Cancel"}
            </button>
          )
        ) : (
          <div className="flex flex-col items-end gap-1">
            <input
              className="w-40 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
              placeholder="Reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700"
                disabled={isPending || cancelReason.trim().length < 3}
                onClick={confirmCancel}
              >
                {isPending ? "…" : "Confirm"}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="max-w-[200px] text-right text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  if (readyForOneClick && !open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" onClick={() => push()} disabled={isPending}>
          {isPending ? "Pushing…" : "Push e-Way Bill"}
        </Button>
        <button
          className="text-[10px] text-slate-500 underline"
          onClick={() => setOpen(true)}
          disabled={isPending}
        >
          Edit details first
        </button>
        {error && <p className="max-w-[220px] text-right text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {ewbStatus === "failed" ? "Retry e-Way Bill" : "Generate e-Way Bill"}
        </Button>
        {error && <p className="max-w-[220px] text-right text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex w-56 flex-col gap-1 rounded border border-slate-200 bg-slate-50 p-2">
      <input
        className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
        placeholder="Vehicle no. (e.g. TN45AB1234)"
        value={vehicleNumber}
        onChange={(e) => setVehicleNumber(e.target.value)}
      />
      <input
        className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
        placeholder="Transporter name"
        value={transporterName}
        onChange={(e) => setTransporterName(e.target.value)}
      />
      <input
        className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
        placeholder="Distance (km, approx.)"
        inputMode="numeric"
        value={distanceKm}
        onChange={(e) => setDistanceKm(e.target.value)}
      />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
          Close
        </Button>
        <Button size="sm" variant="outline" onClick={saveOnly} disabled={isPending}>
          {isPending ? "…" : "Save"}
        </Button>
        <Button size="sm" onClick={submitForm} disabled={isPending}>
          {isPending ? "…" : "Generate"}
        </Button>
      </div>
    </div>
  );
}
