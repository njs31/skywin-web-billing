"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { setFieldOrderStage } from "@/lib/actions/field";
import { DELIVERY_STEPS, nextStep, stepIndex, type DeliveryStep } from "@/lib/order-status";
import { buttonClass, inputClass } from "@/components/field/kit";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

type Step = { checkpoint: string; at: string; note: string | null; by: string | null };

/**
 * Delivery steps of one order, as the farmer sees them in the app, with the time each was
 * reached. Office staff move the order to the next step (or any step) with an optional note.
 */
export function OrderSteps({
  saleId,
  stage,
  history,
  cancelled,
}: {
  saleId: number;
  stage: string | null;
  history: Step[];
  cancelled: boolean;
}) {
  const t = useFieldText();
  const x = t.orders;
  const stages = t.stages as Record<string, string>;
  const locale = fieldLocale(useFieldLang());
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<DeliveryStep | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const current = stepIndex(stage);
  const next = nextStep(stage);
  const reachedAt = new Map<string, string>();
  // History is newest first; keep the latest time each step was set.
  for (const h of history) if (!reachedAt.has(h.checkpoint)) reachedAt.set(h.checkpoint, h.at);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  function save(step: DeliveryStep) {
    setError("");
    setDone("");
    start(async () => {
      try {
        await setFieldOrderStage(saleId, step, note);
        setDone(fmt(x.stepSaved, { s: stages[step] ?? step }));
        setOpen(false);
        setNote("");
        setPicked("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : x.stepFailed);
      }
    });
  }

  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6" aria-label={x.deliverySteps}>
        {DELIVERY_STEPS.map((step, i) => {
          const reached = i <= current;
          const at = reachedAt.get(step);
          return (
            <li key={step} className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    reached ? "bg-[#245B3E] text-white" : "border border-[#1E3317]/20 bg-white text-[#5E6B62]"
                  )}
                  aria-hidden
                >
                  {reached ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={cn("truncate text-[11px] font-semibold", reached ? "text-[#1E3317]" : "text-[#5E6B62]")}>{stages[step] ?? step}</span>
              </div>
              {at && reached ? <p className="mt-0.5 pl-6 text-[10px] text-[#5E6B62]">{when(at)}</p> : null}
            </li>
          );
        })}
      </ol>

      {history[0]?.note ? (
        <p className="text-xs text-[#5E6B62]">
          {fmt(x.stepNote, { note: history[0].note, by: history[0].by || "—" })}
        </p>
      ) : null}

      {cancelled ? null : open ? (
        <div className="space-y-2 rounded-xl border border-[#1E3317]/10 bg-white p-3">
          <label className="block text-xs font-semibold text-[#3E5E2F]" htmlFor={`step-${saleId}`}>
            {x.moveTo}
          </label>
          <select
            id={`step-${saleId}`}
            value={picked}
            onChange={(e) => setPicked(e.target.value as DeliveryStep)}
            className={cn(inputClass, "h-10")}
          >
            <option value="">{x.chooseStep}</option>
            {DELIVERY_STEPS.map((step) => (
              <option key={step} value={step}>
                {stages[step] ?? step}
                {step === stage ? ` (${x.currentStep})` : ""}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder={x.stepNotePh}
            aria-label={x.stepNotePh}
            className={cn(inputClass, "h-10")}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className={buttonClass("ghost", "sm")}>
              {t.common.cancel}
            </button>
            <button type="button" onClick={() => picked && save(picked)} disabled={pending || !picked} className={buttonClass("primary", "sm")}>
              {pending ? t.common.saving : x.saveStep}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {next ? (
            <button type="button" onClick={() => save(next)} disabled={pending} className={buttonClass("primary", "sm")}>
              {pending ? t.common.saving : fmt(x.markAs, { s: stages[next] ?? next })}
            </button>
          ) : null}
          <button type="button" onClick={() => setOpen(true)} disabled={pending} className={buttonClass("ghost", "sm")}>
            {x.otherStep}
          </button>
        </div>
      )}
      {error ? <p role="alert" className="text-xs font-medium text-[#8E3B34]">{error}</p> : null}
      {done && !error ? <p role="status" className="text-xs font-medium text-[#245B3E]">{done}</p> : null}
    </div>
  );
}
