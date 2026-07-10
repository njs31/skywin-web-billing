import * as XLSX from "xlsx";
import path from "path";
import { db } from "@/db";
import { products } from "@/db/schema";
import { inferGstRate, parseSkuFromName } from "@/lib/gst";
import { sql } from "drizzle-orm";

const REPORT_FILE = "REPORT_7ID0XUG9C.XLS";
const SHEET_NAME = "MARG ERP 9+ Excel Report";

function parseQty(value: unknown): number {
  const cleaned = String(value ?? "")
    .replace(/\s/g, "")
    .trim();
  if (!cleaned || cleaned === "-") return 0;
  const qty = parseFloat(cleaned);
  return Number.isFinite(qty) ? qty : 0;
}

function normalizeUnit(value: unknown): string {
  const unit = String(value ?? "pcs").trim().toLowerCase();
  if (!unit || unit === "unit") return "pcs";
  if (unit === "kgs") return "kg";
  if (unit === "bags") return "bag";
  return unit;
}

function isDataRow(row: (string | number)[]): boolean {
  const serial = row[0];
  const name = String(row[1] ?? "").trim();
  if (!name) return false;
  if (name.includes("MARG ERP") || name.includes("SKYWIN BIOTECH")) return false;
  if (String(serial ?? "").toString().includes("Page")) return false;
  return Number.isFinite(Number(serial));
}

function parseInventory(filePath: string) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in ${path.basename(filePath)}`);
  }

  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    defval: "",
  });

  const items: {
    name: string;
    qty: number;
    unit: string;
  }[] = [];

  for (const row of rows.slice(10)) {
    if (!isDataRow(row)) continue;
    const name = String(row[1] ?? "").trim();
    items.push({
      name,
      qty: parseQty(row[2]),
      unit: normalizeUnit(row[3]),
    });
  }

  return items;
}

async function loadExistingRateMap() {
  const existing = await db
    .select({
      name: products.name,
      purchaseRate: products.purchaseRate,
      saleRate: products.saleRate,
      wholesaleRate: products.wholesaleRate,
      gstRate: products.gstRate,
      hsnCode: products.hsnCode,
    })
    .from(products);

  return new Map(
    existing.map((product) => [product.name.toLowerCase().trim(), product])
  );
}

async function main() {
  const filePath = path.join(process.cwd(), REPORT_FILE);
  console.log(`Loading inventory from ${REPORT_FILE}...`);
  const items = parseInventory(filePath);
  if (items.length === 0) {
    throw new Error("No products found in inventory report");
  }

  console.log(`Parsed ${items.length} products from closing stock report`);

  const rateMap = await loadExistingRateMap();
  let matchedRates = 0;

  console.log("Clearing old inventory and transactional data...");
  await db.execute(sql`
    TRUNCATE TABLE
      stock_movements,
      party_payments,
      sale_return_items,
      sale_returns,
      purchase_return_items,
      purchase_returns,
      sale_items,
      sales,
      purchase_items,
      purchases,
      products
    RESTART IDENTITY CASCADE
  `);

  console.log("Importing new inventory...");
  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await db.insert(products).values(
      batch.map((item) => {
        const previous = rateMap.get(item.name.toLowerCase().trim());
        const purchaseRate = previous?.purchaseRate ?? "0.00";
        const saleRate = previous?.saleRate ?? "0.00";
        const wholesaleRate = previous?.wholesaleRate ?? saleRate;
        const gstRate = previous?.gstRate ?? inferGstRate(item.name).toFixed(2);
        const hsnCode = previous?.hsnCode?.trim() || null;
        if (previous) matchedRates++;

        return {
          name: item.name,
          sku: parseSkuFromName(item.name),
          unit: item.unit,
          purchaseRate,
          saleRate,
          wholesaleRate,
          stockQty: Math.max(0, item.qty).toFixed(2),
          gstRate,
          hsnCode,
        };
      })
    );
    console.log(`  Imported ${Math.min(i + batchSize, items.length)} / ${items.length}`);
  }

  console.log("Assigning dummy HSN codes where missing...");
  await db.execute(sql`
    UPDATE products
    SET hsn_code = '99' || lpad(id::text, 6, '0')
    WHERE hsn_code IS NULL OR trim(hsn_code) = ''
  `);

  console.log("Assigning barcodes...");
  await db.execute(sql`
    UPDATE products
    SET barcode = 'SW' || lpad(id::text, 6, '0')
    WHERE barcode IS NULL OR trim(barcode) = ''
  `);

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      inStock: sql<number>`count(*) filter (where ${products.stockQty}::numeric > 0)::int`,
      zeroStock: sql<number>`count(*) filter (where ${products.stockQty}::numeric = 0)::int`,
    })
    .from(products);

  console.log("");
  console.log("Inventory import complete!");
  console.log(`  Products imported: ${stats?.total ?? 0}`);
  console.log(`  With stock > 0: ${stats?.inStock ?? 0}`);
  console.log(`  Zero stock: ${stats?.zeroStock ?? 0}`);
  console.log(`  Rates preserved from old catalog: ${matchedRates}`);
  console.log(`  New products defaulted to rate 0.00: ${items.length - matchedRates}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
