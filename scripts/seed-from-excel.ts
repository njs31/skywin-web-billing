import * as XLSX from "xlsx";
import path from "path";
import { db } from "@/db";
import { products, suppliers } from "@/db/schema";
import { inferGstRate, parseSkuFromName } from "@/lib/gst";
import { sql } from "drizzle-orm";

function parseCompanies(filePath: string) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    defval: "",
  });

  const companies: { name: string; total: number }[] = [];
  for (const row of rows.slice(20)) {
    const name = String(row[0] ?? "").trim();
    if (!name || name.includes("Total") || name.includes("Marg ERP")) continue;
    const total = parseFloat(String(row[3] ?? "0")) || 0;
    companies.push({ name, total });
  }
  return companies;
}

function parseProducts(filePath: string) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    defval: "",
  });

  const items: {
    name: string;
    qty: number;
    rate: number;
    amount: number;
  }[] = [];

  for (const row of rows.slice(20)) {
    const name = String(row[0] ?? "").trim();
    if (!name || name.includes("Items") || name.includes("Marg ERP")) continue;
    items.push({
      name,
      qty: parseFloat(String(row[1] ?? "0")) || 0,
      rate: parseFloat(String(row[2] ?? "0")) || 0,
      amount: parseFloat(String(row[3] ?? "0")) || 0,
    });
  }
  return items;
}

async function main() {
  const root = process.cwd();
  const companyFile = path.join(root, "COMPANY WISE PURCHASE.xlsx");
  const productFile = path.join(root, "PRODUCT WISE PURCHASE.xlsx");

  console.log("Clearing existing data...");
  await db.execute(sql`TRUNCATE TABLE stock_movements, sale_items, sales, purchase_items, purchases, products, suppliers RESTART IDENTITY CASCADE`);

  console.log("Importing suppliers...");
  const companies = parseCompanies(companyFile);
  if (companies.length > 0) {
    await db.insert(suppliers).values(
      companies.map((c) => ({
        name: c.name,
        totalPurchased: c.total.toFixed(2),
      }))
    );
  }
  console.log(`  Imported ${companies.length} suppliers`);

  console.log("Importing products...");
  const items = parseProducts(productFile);
  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await db.insert(products).values(
      batch.map((item) => {
        const gstRate = inferGstRate(item.name);
        const sku = parseSkuFromName(item.name);
        return {
          name: item.name,
          sku,
          purchaseRate: item.rate.toFixed(2),
          saleRate: item.rate.toFixed(2),
          stockQty: item.qty.toFixed(2),
          gstRate: gstRate.toFixed(2),
        };
      })
    );
    console.log(`  Imported ${Math.min(i + batchSize, items.length)} / ${items.length}`);
  }

  console.log("Seed complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
