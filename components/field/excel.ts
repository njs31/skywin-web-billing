"use client";

/**
 * Excel files for the Field dashboard, made and read in the browser (SheetJS loads only when used).
 * Files never pass through the server as files: exports are built from rows the server returns,
 * and imports are read here and sent to the server as plain rows.
 */

type Cell = string | number | boolean | null | undefined;

/** Today in India, for file names: 2026-11-23. */
export function todayStamp() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Downloads rows as an .xlsx file. Column widths follow the longest value (capped). */
export async function downloadExcel(fileName: string, sheetName: string, rows: Array<Record<string, Cell>>, columns: readonly string[]) {
  const XLSX = await import("xlsx");
  const data = rows.map((row) => columns.map((col) => (row[col] ?? "") as Cell));
  const sheet = XLSX.utils.aoa_to_sheet([columns as string[], ...data]);
  sheet["!cols"] = columns.map((col, i) => {
    const longest = data.reduce((max, r) => Math.max(max, String(r[i] ?? "").length), col.length);
    return { wch: Math.min(Math.max(longest + 2, 8), 60) };
  });
  // Freeze the header row so it stays visible while scrolling.
  sheet["!views"] = [{ state: "frozen", ySplit: 1 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`, { compression: true });
}

/** Largest spreadsheet the import reads (bytes). */
export const EXCEL_MAX_BYTES = 8 * 1024 * 1024;

/** Reads the first sheet of an .xlsx, .xls or .csv file into rows keyed by its header row. */
export async function readExcel(file: File): Promise<Array<Record<string, unknown>>> {
  if (file.size > EXCEL_MAX_BYTES) throw new Error("This file is larger than 8 MB. Split it into smaller files.");
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choose an Excel file (.xlsx, .xls) or a .csv file.");
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array", cellDates: false, dense: true });
  const first = book.SheetNames[0];
  if (!first) throw new Error("This file has no sheets.");
  const sheet = book.Sheets[first];
  // raw: numbers stay numbers (prices, stock); defval keeps empty cells out.
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null, blankrows: false });
}
