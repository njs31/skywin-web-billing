/**
 * One-time fix: set gst_rate = 0 for Master File products marked Exempted/0.
 * Does not wipe inventory or transactional data.
 */
import * as XLSX from "xlsx";
import path from "path";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

const MASTER_FILE = "Master File (1).xlsx";

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
    text === "exempted" ||
    text === "exempt" ||
    text === "gst exempt" ||
    text === "gst exempted"
  );
}

async function main() {
  const filePath = path.join(process.cwd(), MASTER_FILE);
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

  console.log(`Found ${barcodes.length} exempt barcodes in Master File`);
  if (barcodes.length === 0) {
    process.exit(0);
  }

  const matched = await db
    .select({ id: products.id, barcode: products.barcode, gstRate: products.gstRate })
    .from(products)
    .where(inArray(products.barcode, barcodes));

  const toFix = matched.filter((p) => parseFloat(p.gstRate) !== 0);
  console.log(`Matched products: ${matched.length}, need GST fix: ${toFix.length}`);

  if (toFix.length > 0) {
    await db
      .update(products)
      .set({ gstRate: "0.00" })
      .where(
        inArray(
          products.id,
          toFix.map((p) => p.id)
        )
      );
  }

  const [stats] = await db
    .select({
      exempt: sql<number>`count(*) filter (where ${products.gstRate}::numeric = 0)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(products);

  console.log(`Done. Products with 0% GST: ${stats?.exempt ?? 0} / ${stats?.total ?? 0}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
