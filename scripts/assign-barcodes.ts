import { db } from "@/db";
import { products } from "@/db/schema";
import { sql, isNull, or, eq } from "drizzle-orm";

async function main() {
  console.log("Assigning barcodes to products without one...");

  await db.execute(sql`
    UPDATE products
    SET barcode = 'SW' || lpad(id::text, 6, '0')
    WHERE barcode IS NULL OR trim(barcode) = ''
  `);

  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`${products.barcode} is not null`);

  console.log(`Products with barcodes: ${count?.n ?? 0}`);
  console.log("Done! QR codes can encode values like SW000001");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
