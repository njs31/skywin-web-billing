import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Migrating existing product stock into OPENING batches...");

  const result = await db.execute(sql`
    INSERT INTO product_batches (
      product_id, batch_number, qty, purchase_rate, sale_rate,
      expiry_date, notes, created_at, updated_at
    )
    SELECT
      id,
      'OPENING',
      stock_qty,
      purchase_rate,
      sale_rate,
      expiry_date,
      'Migrated from product stock',
      NOW(),
      NOW()
    FROM products
    WHERE stock_qty::numeric > 0
    ON CONFLICT (product_id, batch_number) DO NOTHING
  `);

  const [stats] = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM product_batches) AS batches,
      (SELECT count(*)::int FROM products WHERE stock_qty::numeric > 0) AS products_with_stock,
      (
        SELECT count(*)::int FROM products p
        WHERE stock_qty::numeric > 0
          AND EXISTS (SELECT 1 FROM product_batches b WHERE b.product_id = p.id)
      ) AS covered
  `);

  console.log(`Inserted (new): ${result.count ?? 0}`);
  console.log(stats);
  console.log("Done!");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
