import { db } from "@/db";
import { products } from "@/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Assigning dummy HSN codes to products without one...");

  const updated = await db.execute(sql`
    UPDATE products
    SET hsn_code = '99' || lpad(id::text, 6, '0')
    WHERE hsn_code IS NULL OR trim(hsn_code) = ''
  `);

  const [withHsn] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`trim(coalesce(${products.hsnCode}, '')) <> ''`);

  const [missing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`trim(coalesce(${products.hsnCode}, '')) = ''`);

  console.log(`Updated rows: ${updated.count ?? "ok"}`);
  console.log(`Products with HSN: ${withHsn?.n ?? 0}`);
  console.log(`Products still missing HSN: ${missing?.n ?? 0}`);
  console.log("Dummy format example: 99000001, 99000002, ...");
  console.log("Done!");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
