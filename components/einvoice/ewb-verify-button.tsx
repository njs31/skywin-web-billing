"use client";

import { useState, useTransition } from "react";
import { fetchEwaybillDetailsByIrn } from "@/lib/actions/einvoice";

function str(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

/** Fields worth surfacing from an e-way bill lookup, in display order. */
const FIELDS: Array<{ key: string; label: string }> = [
  { key: "Status", label: "NIC status" },
  { key: "EwbNo", label: "EWB no." },
  { key: "EwbDt", label: "Generated" },
  { key: "EwbValidTill", label: "Valid till" },
];

/**
 * Read-only e-way bill verification against the sale's IRN. Never writes —
 * it answers "what does the portal hold for this e-way bill right now?"
 */
export function EwbVerifyButton({ saleId }: { saleId: number }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const check = () => {
    setError("");
    setResult(null);
    setOpen(true);
    startTransition(async () => {
      try {
        setResult(await fetchEwaybillDetailsByIrn(saleId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lookup failed.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {!open ? (
        <button
          type="button"
          className="text-[11px] text-slate-500 underline hover:text-slate-700"
          onClick={check}
          disabled={isPending}
        >
          Verify on portal
        </button>
      ) : (
        <div className="w-52 rounded border border-slate-200 bg-slate-50 p-2 text-left">
          {isPending ? (
            <p className="text-[11px] text-slate-500">Checking portal…</p>
          ) : error ? (
            <>
              <p className="text-[11px] text-red-600">{error}</p>
              <button
                type="button"
                className="mt-1 text-[11px] text-slate-500 underline"
                onClick={() => setOpen(false)}
              >
                Dismiss
              </button>
            </>
          ) : result ? (
            <>
              <dl className="space-y-0.5">
                {FIELDS.map(({ key, label }) => {
                  const value = str(result[key]);
                  if (!value) return null;
                  return (
                    <div key={key} className="flex justify-between gap-2 text-[11px]">
                      <dt className="shrink-0 text-slate-500">{label}</dt>
                      <dd className="break-all text-right font-mono text-slate-700">
                        {value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <button
                type="button"
                className="mt-1 text-[11px] text-slate-500 underline"
                onClick={() => setOpen(false)}
              >
                Dismiss
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
