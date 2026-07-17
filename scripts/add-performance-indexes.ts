import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Creates the pg_trgm extension and all search/reporting indexes.
 * Matches the index definitions in db/schema.ts so future `db:push`
 * runs stay in sync. Safe to re-run (IF NOT EXISTS everywhere).
 */
const statements: [string, string][] = [
  ["pg_trgm extension", `CREATE EXTENSION IF NOT EXISTS pg_trgm`],

  // Product search (POS / purchase / returns / stock adjust)
  [
    "products name trigram",
    `CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON products USING gin (name gin_trgm_ops)`,
  ],
  [
    "products sku trigram",
    `CREATE INDEX IF NOT EXISTS products_sku_trgm_idx ON products USING gin (sku gin_trgm_ops)`,
  ],
  [
    "products barcode",
    `CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode)`,
  ],
  ["products sku", `CREATE INDEX IF NOT EXISTS products_sku_idx ON products (sku)`],

  // Batches
  [
    "product_batches product_id",
    `CREATE INDEX IF NOT EXISTS product_batches_product_id_idx ON product_batches (product_id)`,
  ],
  [
    "product_batches batch_number trigram",
    `CREATE INDEX IF NOT EXISTS product_batches_batch_number_trgm_idx ON product_batches USING gin (batch_number gin_trgm_ops)`,
  ],

  // Sales / checkout / outstanding
  [
    "sales customer_id",
    `CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON sales (customer_id)`,
  ],
  ["sales date", `CREATE INDEX IF NOT EXISTS sales_date_idx ON sales (date)`],
  [
    "sales invoice_no pattern",
    `CREATE INDEX IF NOT EXISTS sales_invoice_no_pattern_idx ON sales (invoice_no text_pattern_ops)`,
  ],
  [
    "sale_items sale_id",
    `CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (sale_id)`,
  ],
  [
    "sale_items product_id",
    `CREATE INDEX IF NOT EXISTS sale_items_product_id_idx ON sale_items (product_id)`,
  ],
  [
    "sale_returns customer_id",
    `CREATE INDEX IF NOT EXISTS sale_returns_customer_id_idx ON sale_returns (customer_id)`,
  ],
  [
    "party_payments customer_id",
    `CREATE INDEX IF NOT EXISTS party_payments_customer_id_idx ON party_payments (customer_id)`,
  ],
  [
    "stock_movements product_id",
    `CREATE INDEX IF NOT EXISTS stock_movements_product_id_idx ON stock_movements (product_id)`,
  ],

  // Customer search
  [
    "customers phone",
    `CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone)`,
  ],
  [
    "customers name",
    `CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (name)`,
  ],
];

async function main() {
  for (const [label, statement] of statements) {
    process.stdout.write(`Creating ${label}... `);
    await db.execute(sql.raw(statement));
    console.log("done");
  }
  console.log("\nAll performance indexes are in place.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
