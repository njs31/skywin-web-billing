import { db } from "@/db";
import { products } from "@/db/schema";
import { sql } from "drizzle-orm";

const SKU_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BATCH_SIZE = 100;

function randomSkuSegment(length = 6): string {
  let value = "";
  for (let i = 0; i < length; i++) {
    value += SKU_CHARS[Math.floor(Math.random() * SKU_CHARS.length)];
  }
  return value;
}

function createUniqueSku(used: Set<string>): string {
  let sku = "";
  do {
    sku = `SKW-${randomSkuSegment()}`;
  } while (used.has(sku));
  used.add(sku);
  return sku;
}

async function main() {
  console.log("Assigning random SKU codes to all products...");

  const allProducts = await db
    .select({ id: products.id })
    .from(products)
    .orderBy(products.id);

  const used = new Set<string>();
  const assignments = allProducts.map((product) => ({
    id: product.id,
    sku: createUniqueSku(used),
  }));

  for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
    const batch = assignments.slice(i, i + BATCH_SIZE);
    const values = sql.join(
      batch.map((row) => sql`(${row.id}, ${row.sku})`),
      sql`, `
    );

    await db.execute(sql`
      UPDATE products AS p
      SET sku = v.sku
      FROM (VALUES ${values}) AS v(id, sku)
      WHERE p.id = v.id
    `);

    console.log(`  Updated ${Math.min(i + BATCH_SIZE, assignments.length)} / ${assignments.length}`);
  }

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withSku: sql<number>`count(*) filter (where trim(coalesce(${products.sku}, '')) <> '')::int`,
    })
    .from(products);

  console.log("");
  console.log("SKU assignment complete!");
  console.log(`  Products updated: ${assignments.length}`);
  console.log(`  Products with SKU: ${stats?.withSku ?? 0} / ${stats?.total ?? 0}`);
  console.log("  Format example: SKW-A3K9P2");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
