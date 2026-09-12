"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateEwb } from "@/lib/actions/einvoice";
import { Button } from "@/components/ui/button";

export function GenerateEwbButton({
  saleId,
  ewbNo,
  ewbStatus,
  ewbValidUntil,
  ewbError,
}: {
  saleId: number;
  ewbNo: string | null;
  ewbStatus: string;
  ewbValidUntil: string | null;
  ewbError: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(ewbError ?? "");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [distanceKm, setDistanceKm] = useState("");

  const submit = () => {
    setError("");
    startTransition(async () => {
      try {
        await generateEwb(saleId, {
          vehicleNumber: vehicleNumber.trim() || undefined,
          transporterName: transporterName.trim() || undefined,
          distanceKm: distanceKm.trim() ? Number(distanceKm) : undefined,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate e-Way Bill");
      }
    });
  };

  if (ewbNo && ewbStatus !== "cancelled") {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-700">
          EWB {ewbNo}
        </span>
        {ewbValidUntil && (
          <span className="text-[10px] text-slate-500">valid till {ewbValidUntil}</span>
        )}
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
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={isPending}>
          {isPending ? "…" : "Generate"}
        </Button>
      </div>
    </div>
  );
}
