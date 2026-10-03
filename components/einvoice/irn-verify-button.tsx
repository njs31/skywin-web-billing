"use client";

import { useState, useTransition } from "react";
import {
  fetchIrnByDocDetails,
  fetchIrnDetails,
} from "@/lib/actions/einvoice";
import { friendlyLookupError } from "./lookup-error";

function str(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

/** Fields worth surfacing from an IRN lookup, in display order. */
const FIELDS: Array<{ key: string; label: string }> = [
  { key: "Status", label: "IRP status" },
  { key: "Irn", label: "IRN" },
  { key: "AckNo", label: "Ack no." },
  { key: "AckDt", label: "Ack date" },
];

/**
 * Read-only IRP verification for a sale row. "details" re-fetches a pushed
 * IRN; "doc" looks one up by document number/date (the recovery path when
 * a push timed out and the row was left without an IRN). Never writes.
 */
export function IrnVerifyButton({
  saleId,
  mode,
}: {
  saleId: number;
  mode: "details" | "doc";
}) {
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
        const data =
          mode === "details"
            ? await fetchIrnDetails(saleId)
            : await fetchIrnByDocDetails(saleId);
        setResult(data);
      } catch (e) {
        setError(friendlyLookupError(e));
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
          {mode === "details" ? "Verify on IRP" : "Check IRP for IRN"}
        </button>
      ) : (
        <div className="w-52 rounded border border-slate-200 bg-slate-50 p-2 text-left">
          {isPending ? (
            <p className="text-[11px] text-slate-500">Checking IRP…</p>
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
