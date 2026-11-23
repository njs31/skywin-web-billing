"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { buttonClass } from "@/components/field/kit";
import { downloadExcel, todayStamp } from "@/components/field/excel";
import { useFieldText } from "@/components/field/lang";

type Cell = string | number | boolean | null | undefined;

/** "Export to Excel" for a Field dashboard page. `rows` runs on click (it may call the server). */
export function ExportButton({
  fileName,
  sheetName,
  columns,
  rows,
  onError,
}: {
  /** Without extension or date: "skywin-farmers" → skywin-farmers-2026-11-23.xlsx */
  fileName: string;
  sheetName: string;
  columns: readonly string[];
  rows: () => Promise<Array<Record<string, Cell>>> | Array<Record<string, Cell>>;
  onError?: (message: string) => void;
}) {
  const t = useFieldText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const data = await rows();
      await downloadExcel(`${fileName}-${todayStamp()}`, sheetName, data, columns);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.common.exportFailed;
      if (onError) onError(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={() => void run()} disabled={busy} className={buttonClass("secondary", "sm")}>
        <Download aria-hidden /> {busy ? t.common.exporting : t.common.exportExcel}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-[#8E3B34]">
          {error}
        </span>
      ) : null}
    </span>
  );
}
