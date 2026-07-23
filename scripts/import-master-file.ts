import * as XLSX from "xlsx";
import path from "path";
import { db } from "@/db";
import { categories, productBatches, products } from "@/db/schema";
import { sql } from "drizzle-orm";

const MASTER_FILE = "Master File (1).xlsx";
const SHEET_NAME = "Inventory";

type MasterRow = {
  name: string;
  content: string;
  batchNumber: string;
  barcode: string;
  hsnCode: string | null;
  categoryName: string | null;
  gstRate: number;
  purchaseRate: number;
  wholesaleRate: number;
  saleRate: number;
  mrp: number | null;
  qty: number;
  expiryDate: string | null;
};

function isNil(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const text = String(value).trim().toLowerCase();
  return text === "" || text === "nil" || text === "none" || text === "-";
}

function parseNumber(value: unknown, fallback = 0): number {
  if (isNil(value)) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value).replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

function parseOptionalNumber(value: unknown): number | null {
  if (isNil(value)) return null;
  const num = parseNumber(value, NaN);
  return Number.isFinite(num) ? num : null;
}

function parseText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

function parseBarcode(value: unknown): string {
  if (isNil(value)) return "";
  if (typeof value === "number") {
    return String(Math.trunc(value));
  }
  const text = String(value).trim();
  if (/^\d+\.0+$/.test(text)) return text.replace(/\.0+$/, "");
  return text;
}

function parseBatchNumber(value: unknown): string {
  if (isNil(value)) return "OPENING";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? String(value)
      : String(value).replace(/\.0+$/, "");
  }
  const text = String(value).trim().toUpperCase();
  return text || "OPENING";
}

function normalizeUnit(content: string): string {
  const unit = content.trim();
  if (!unit) return "pcs";
  const upper = unit.toUpperCase();
  if (upper === "NOS" || upper === "NO" || upper === "PCS" || upper === "PC") {
    return "pcs";
  }
  return unit;
}

function excelSerialToDate(serial: number): Date | null {
  // Excel serial date (1900 date system)
  if (!Number.isFinite(serial) || serial < 1) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseExpiry(value: unknown): string | null {
  if (isNil(value)) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }

  if (typeof value === "number") {
    const d = excelSerialToDate(value);
    return d ? formatDate(d) : null;
  }

  const text = String(value).trim();

  // DD.MM.YYYY or DD-MM-YYYY or DD/MM/YYYY
  const m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (
      d.getUTCFullYear() === year &&
      d.getUTCMonth() === month - 1 &&
      d.getUTCDate() === day
    ) {
      return formatDate(d);
    }
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed);

  return null;
}

function parseMasterFile(filePath: string): MasterRow[] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === SHEET_NAME.toLowerCase()) ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in ${path.basename(filePath)}`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: true,
  });

  const items: MasterRow[] = [];

  for (const row of rows) {
    const name = parseText(row["Product Name"]);
    if (!name) continue;

    const purchaseRate = parseNumber(row["Purchase Value"]);
    const saleRate = parseNumber(row["Retail Sale Value"]);
    const wholesaleRaw = parseOptionalNumber(row["Wholesale Value"]);
    const qty = Math.max(0, parseNumber(row["Quantity"]));
    const categoryName = parseText(row["Category"]) || null;
    const content = parseText(row["Content"]);

    items.push({
      name,
      content,
      batchNumber: parseBatchNumber(row["Batch Number"]),
      barcode: parseBarcode(row["Barcode / SKU"]),
      hsnCode: isNil(row["HSN Code"])
        ? null
        : parseBarcode(row["HSN Code"]) || null,
      categoryName,
      gstRate: parseNumber(row["GST%"], 18),
      purchaseRate,
      wholesaleRate: wholesaleRaw ?? saleRate,
      saleRate,
      mrp: parseOptionalNumber(row["MRP"]),
      qty,
      expiryDate: parseExpiry(row["Expiry"]),
    });
  }

  return items;
}

async function main() {
  const filePath = path.join(process.cwd(), MASTER_FILE);
  console.log(`Loading inventory from ${MASTER_FILE}...`);
  const items = parseMasterFile(filePath);
  if (items.length === 0) {
    throw new Error("No products found in Master File inventory sheet");
  }
  console.log(`Parsed ${items.length} products`);

  console.log("Clearing current inventory and related transactional data...");
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
      product_batches,
      products,
      categories
    RESTART IDENTITY CASCADE
  `);

  const uniqueCategories = [
    ...new Set(
      items
        .map((item) => item.categoryName)
        .filter((name): name is string => Boolean(name))
    ),
  ].sort((a, b) => a.localeCompare(b));

  console.log(`Creating ${uniqueCategories.length} categories...`);
  const categoryIdByName = new Map<string, number>();
  if (uniqueCategories.length > 0) {
    const inserted = await db
      .insert(categories)
      .values(uniqueCategories.map((name) => ({ name })))
      .returning({ id: categories.id, name: categories.name });
    for (const row of inserted) {
      categoryIdByName.set(row.name, row.id);
    }
  }

  console.log("Importing products and batches...");
  const batchSize = 100;
  let batchRows = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);

    const insertedProducts = await db
      .insert(products)
      .values(
        chunk.map((item) => ({
          name: item.name,
          sku: item.barcode || null,
          barcode: item.barcode || null,
          categoryId: item.categoryName
            ? categoryIdByName.get(item.categoryName) ?? null
            : null,
          unit: normalizeUnit(item.content),
          purchaseRate: item.purchaseRate.toFixed(2),
          saleRate: item.saleRate.toFixed(2),
          wholesaleRate: item.wholesaleRate.toFixed(2),
          mrp: item.mrp !== null ? item.mrp.toFixed(2) : null,
          stockQty: item.qty.toFixed(2),
          hsnCode: item.hsnCode,
          gstRate: item.gstRate.toFixed(2),
          expiryDate: item.expiryDate,
          isActive: true,
        }))
      )
      .returning({ id: products.id });

    const batchValues = insertedProducts
      .map((product, index) => {
        const item = chunk[index];
        if (!item || item.qty <= 0) return null;
        return {
          productId: product.id,
          batchNumber: item.batchNumber,
          qty: item.qty.toFixed(2),
          purchaseRate: item.purchaseRate.toFixed(2),
          saleRate: item.saleRate.toFixed(2),
          expiryDate: item.expiryDate,
          notes: "Imported from Master File",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (batchValues.length > 0) {
      await db.insert(productBatches).values(batchValues);
      batchRows += batchValues.length;
    }

    console.log(`  Imported ${Math.min(i + batchSize, items.length)} / ${items.length}`);
  }

  // Backfill any missing HSN / barcode just in case
  await db.execute(sql`
    UPDATE products
    SET hsn_code = '99' || lpad(id::text, 6, '0')
    WHERE hsn_code IS NULL OR trim(hsn_code) = ''
  `);

  await db.execute(sql`
    UPDATE products
    SET barcode = 'SW' || lpad(id::text, 6, '0')
    WHERE barcode IS NULL OR trim(barcode) = ''
  `);

  await db.execute(sql`
    UPDATE products
    SET sku = barcode
    WHERE sku IS NULL OR trim(sku) = ''
  `);

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      inStock: sql<number>`count(*) filter (where ${products.stockQty}::numeric > 0)::int`,
      zeroStock: sql<number>`count(*) filter (where ${products.stockQty}::numeric = 0)::int`,
      withExpiry: sql<number>`count(*) filter (where ${products.expiryDate} is not null)::int`,
      totalQty: sql<string>`coalesce(sum(${products.stockQty}::numeric), 0)`,
    })
    .from(products);

  const [batchStats] = await db
    .select({
      batches: sql<number>`count(*)::int`,
      batchQty: sql<string>`coalesce(sum(${productBatches.qty}::numeric), 0)`,
    })
    .from(productBatches);

  console.log("");
  console.log("Master File inventory import complete!");
  console.log(`  Products: ${stats?.total ?? 0}`);
  console.log(`  With stock > 0: ${stats?.inStock ?? 0}`);
  console.log(`  Zero stock: ${stats?.zeroStock ?? 0}`);
  console.log(`  With expiry: ${stats?.withExpiry ?? 0}`);
  console.log(`  Total qty: ${stats?.totalQty ?? "0"}`);
  console.log(`  Batches created: ${batchStats?.batches ?? batchRows}`);
  console.log(`  Batch qty total: ${batchStats?.batchQty ?? "0"}`);
  console.log(`  Categories: ${uniqueCategories.length}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
