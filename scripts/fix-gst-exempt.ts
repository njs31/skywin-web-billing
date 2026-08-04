/**
 * One-time fix: set gst_rate = 0 for Master File products marked Exempted/0.
 * Does not wipe inventory or transactional data.
 *
 * Run: npm run db:fix-gst-exempt
 * Expects master-data.xlsx (or Master File (1).xlsx) in the project root.
 */
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { products } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";

const CANDIDATE_FILES = [
  "master-data.xlsx",
  "Master File (1).xlsx",
  "Master File.xlsx",
];

function resolveMasterFile(): string {
  for (const name of CANDIDATE_FILES) {
    const full = path.join(process.cwd(), name);
    if (fs.existsSync(full)) return full;
  }
  throw new Error(
    `Master inventory Excel not found. Looked for:\n` +
      CANDIDATE_FILES.map((f) => `  - ${path.join(process.cwd(), f)}`).join("\n") +
      `\nPlace the file in the project root and re-run.`
  );
}

function isNil(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const text = String(value).trim().toLowerCase();
  return text === "" || text === "nil" || text === "none" || text === "-";
}

function parseBarcode(value: unknown): string {
  if (isNil(value)) return "";
  if (typeof value === "number") return String(Math.trunc(value));
  const text = String(value).trim();
  if (/^\d+\.0+$/.test(text)) return text.replace(/\.0+$/, "");
  return text;
}

function isExempt(value: unknown): boolean {
  if (isNil(value)) return false;
  if (typeof value === "number") return value === 0;
  const text = String(value).trim().toLowerCase();
  return (
    text === "0" ||
    text === "0.0" ||
    text === "0.00" ||
    text === "exempted" ||
    text === "exempt" ||
    text === "gst exempt" ||
    text === "gst exempted" ||
    text === "nil"
  );
}

async function main() {
  const filePath = resolveMasterFile();
  console.log(`Reading: ${filePath}`);

  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === "inventory") ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: true,
  });

  const barcodes = [
    ...new Set(
      rows
        .filter((row) => isExempt(row["GST%"]))
        .map((row) => parseBarcode(row["Barcode / SKU"]))
        .filter(Boolean)
    ),
  ];

  console.log(
    `Found ${barcodes.length} exempt barcodes in sheet "${sheetName}"`
  );
  if (barcodes.length === 0) {
    process.exit(0);
  }

  const matched = await db
    .select({
      id: products.id,
      barcode: products.barcode,
      gstRate: products.gstRate,
    })
    .from(products)
    .where(inArray(products.barcode, barcodes));

  const toFix = matched.filter(
    (p: { gstRate: string }) => parseFloat(p.gstRate) !== 0
  );
  console.log(
    `Matched products: ${matched.length}, need GST fix: ${toFix.length}`
  );

  if (toFix.length > 0) {
    await db
      .update(products)
      .set({ gstRate: "0.00" })
      .where(
        inArray(
          products.id,
          toFix.map((p: { id: number }) => p.id)
        )
      );
  }

  const [stats] = await db
    .select({
      exempt: sql<number>`count(*) filter (where ${products.gstRate}::numeric = 0)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(products);

  console.log(
    `Done. Products with 0% GST: ${stats?.exempt ?? 0} / ${stats?.total ?? 0}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
