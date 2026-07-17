import { db } from "@/db";
import { products } from "@/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Assigning dummy expiry dates to products without one...");

  // Spread expiry dates from ~6 months out over the following year
  // so Near Expiry alerts don't flood all at once.
  const updated = await db.execute(sql`
    UPDATE products
    SET expiry_date = (
      CURRENT_DATE
      + INTERVAL '180 days'
      + ((id % 365) * INTERVAL '1 day')
    )::date
    WHERE expiry_date IS NULL
  `);

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withExpiry: sql<number>`count(*) filter (where ${products.expiryDate} is not null)::int`,
      missing: sql<number>`count(*) filter (where ${products.expiryDate} is null)::int`,
      minExp: sql<string>`min(${products.expiryDate})`,
      maxExp: sql<string>`max(${products.expiryDate})`,
    })
    .from(products);

  console.log(`Updated rows: ${updated.count ?? "ok"}`);
  console.log(`Products with expiry: ${stats?.withExpiry ?? 0} / ${stats?.total ?? 0}`);
  console.log(`Still missing: ${stats?.missing ?? 0}`);
  console.log(`Expiry range: ${stats?.minExp} → ${stats?.maxExp}`);
  console.log("Done!");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
