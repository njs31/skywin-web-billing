"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, Upload } from "lucide-react";
import type { ImportRowPlan } from "@/lib/queries/field-product-excel";
import { PRODUCT_SHEET_COLUMNS, normalizeSheetRows, type ProductSheetRow } from "@/lib/field-product-sheet";
import { Modal } from "@/components/field/modal";
import { Badge, Notice, buttonClass } from "@/components/field/kit";
import { downloadExcel, readExcel } from "@/components/field/excel";
import { useFieldText } from "@/components/field/lang";
import { fmt } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

type Plan = { rows: ImportRowPlan[]; counts: { update: number; create: number; unchanged: number; error: number } };
type Result = { updated: number; created: number; unchanged: number; failed: Array<{ row: number; name: string; reason: string }> };

/** Sends the rows to /api/field/products-import (a route: big files exceed the server-action limit). */
async function importRequest<T>(mode: "preview" | "apply", rows: ProductSheetRow[], fallback: string): Promise<T> {
  const res = await fetch("/api/field/products-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, rows }),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || (res.status === 413 ? "This file is too large. Split it into smaller files." : fallback));
  return json;
}

/** Import from Excel: choose a file, see what each row changes, then save. */
export function ProductImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useFieldText();
  const p = t.products;
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ProductSheetRow[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState<"changes" | "error" | "all">("changes");

  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    setPlan(null);
    setResult(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const raw = await readExcel(file);
      const normalized = normalizeSheetRows(raw);
      if (!normalized.length) throw new Error(p.importEmpty);
      setRows(normalized);
      const preview = await importRequest<Plan>("preview", normalized, p.importFailed);
      setPlan(preview);
      setShow(preview.counts.update + preview.counts.create > 0 ? "changes" : preview.counts.error ? "error" : "all");
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : p.importFailed);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const done = await importRequest<Result>("apply", rows, p.importFailed);
      setResult(done);
      setPlan(null);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : p.importFailed);
    } finally {
      setBusy(false);
    }
  }

  const template = () =>
    downloadExcel("skywin-products-template", "Products", [
      {
        Name: "Example product 1 L",
        SKU: "",
        Category: "",
        Subcategory: "",
        HSN: "38089199",
        "GST %": 18,
        MRP: 650,
        "Sale rate": 590,
        "Purchase rate": 480,
        Stock: 10,
        Unit: "pcs",
        "In app": "On",
      },
    ], PRODUCT_SHEET_COLUMNS);

  const toSave = plan ? plan.counts.update + plan.counts.create : 0;
  const shown = plan
    ? plan.rows.filter((r) => (show === "all" ? true : show === "error" ? r.action === "error" : r.action === "update" || r.action === "create"))
    : [];

  return (
    <Modal title={p.importTitle} description={p.importHelp} onClose={onClose} busy={busy} closeLabel={t.common.close} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            id="product-import-file"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
          <label htmlFor="product-import-file" className={cn(buttonClass("primary", "sm"), busy && "pointer-events-none opacity-60")}>
            <Upload aria-hidden /> {fileName ? p.importChooseAnother : p.importChoose}
          </label>
          <button type="button" onClick={() => void template()} className={buttonClass("ghost", "sm")}>
            <Download aria-hidden /> {p.importTemplate}
          </button>
          {fileName ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[#5E6B62]">
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{fileName}</span>
            </span>
          ) : null}
        </div>

        <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-[#5E6B62]">
          <li>{p.importRuleMatch}</li>
          <li>{p.importRuleBlank}</li>
          <li>{p.importRuleNew}</li>
          <li>{p.importRuleStock}</li>
        </ul>

        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm text-[#3E5E2F]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1E3317]/20 border-t-[#3E5E2F]" aria-hidden />
            {plan ? p.importSaving : p.importReading}
          </p>
        ) : null}
        {error ? <Notice tone="red">{error}</Notice> : null}

        {result ? (
          <div className="space-y-3">
            <Notice tone={result.failed.length ? "amber" : "green"}>
              {fmt(p.importDone, { created: result.created, updated: result.updated, unchanged: result.unchanged, failed: result.failed.length })}
            </Notice>
            {result.failed.length ? (
              <ul className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-[#1E3317]/10 p-3 text-xs">
                {result.failed.map((f) => (
                  <li key={f.row}>
                    <span className="font-semibold text-[#1E3317]">
                      {fmt(p.importRow, { n: f.row })} · {f.name}
                    </span>{" "}
                    <span className="text-[#8E3B34]">{f.reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={buttonClass("primary", "sm")}>
                {t.common.close}
              </button>
            </div>
          </div>
        ) : null}

        {plan ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="green">{fmt(p.importCountUpdate, { n: plan.counts.update })}</Badge>
              <Badge tone="blue">{fmt(p.importCountNew, { n: plan.counts.create })}</Badge>
              <Badge tone="grey">{fmt(p.importCountSame, { n: plan.counts.unchanged })}</Badge>
              {plan.counts.error ? <Badge tone="red">{fmt(p.importCountError, { n: plan.counts.error })}</Badge> : null}
            </div>
            <div className="flex gap-2 text-xs" role="tablist">
              {(["changes", "error", "all"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={show === key}
                  onClick={() => setShow(key)}
                  className={cn(
                    "rounded-full px-3 py-1 font-medium",
                    show === key ? "bg-[#1E3317] text-white" : "border border-[#1E3317]/10 text-[#3E5E2F]"
                  )}
                >
                  {key === "changes" ? p.importShowChanges : key === "error" ? p.importShowErrors : p.importShowAll}
                </button>
              ))}
            </div>
            <ul className="max-h-[45vh] divide-y divide-[#1E3317]/8 overflow-y-auto rounded-xl border border-[#1E3317]/10">
              {shown.length === 0 ? (
                <li className="p-4 text-center text-sm text-[#5E6B62]">{p.importNothingHere}</li>
              ) : (
                shown.slice(0, 500).map((r) => (
                  <li key={r.row} className="flex gap-3 p-3 text-xs">
                    {r.action === "error" ? (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#8E3B34]" aria-hidden />
                    ) : (
                      <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", r.action === "unchanged" ? "text-[#9AA59D]" : "text-[#245B3E]")} aria-hidden />
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-semibold text-[#1E3317]">
                        {fmt(p.importRow, { n: r.row })} · {r.name}
                        {r.productId ? <span className="font-normal text-[#5E6B62]"> · ID {r.productId}</span> : null}
                      </p>
                      {r.errors.length ? <p className="text-[#8E3B34]">{r.errors.join("; ")}</p> : null}
                      {r.changes.length ? <p className="text-[#29332C]">{r.changes.join(" · ")}</p> : null}
                      {r.action === "unchanged" ? <p className="text-[#5E6B62]">{p.importNoChange}</p> : null}
                      {r.notes.length ? <p className="text-[#8A5A00]">{r.notes.join("; ")}</p> : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
            {shown.length > 500 ? <p className="text-xs text-[#5E6B62]">{fmt(p.importMoreRows, { n: shown.length - 500 })}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} disabled={busy} className={buttonClass("secondary", "sm")}>
                {t.common.cancel}
              </button>
              <button type="button" onClick={() => void save()} disabled={busy || toSave === 0} className={buttonClass("primary", "sm")}>
                {toSave === 0 ? p.importNothingToSave : fmt(p.importSave, { n: toSave })}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
