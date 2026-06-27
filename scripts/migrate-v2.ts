import { db } from "@/db";
import { products, categories } from "@/db/schema";
import { inferCategory } from "@/lib/gst";
import { seedDefaultSettings } from "@/lib/settings";
import { sql, isNull, eq, inArray } from "drizzle-orm";

async function main() {
  console.log("Running v2 migration...");
  await seedDefaultSettings();

  console.log("Setting wholesale rates...");
  await db.execute(
    sql`UPDATE products SET wholesale_rate = sale_rate WHERE wholesale_rate IS NULL`
  );

  console.log("Assigning categories...");
  const uncategorized = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(isNull(products.categoryId));

  const categoryNames = [
    ...new Set(uncategorized.map((p) => inferCategory(p.name))),
  ];

  for (const name of categoryNames) {
    await db.insert(categories).values({ name }).onConflictDoNothing();
  }

  const allCategories = await db.select().from(categories);
  const catMap = Object.fromEntries(allCategories.map((c) => [c.name, c.id]));

  const byCategory: Record<string, number[]> = {};
  for (const p of uncategorized) {
    const cat = inferCategory(p.name);
    byCategory[cat] ??= [];
    byCategory[cat].push(p.id);
  }

  for (const [catName, ids] of Object.entries(byCategory)) {
    const catId = catMap[catName];
    if (!catId) continue;
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await db
        .update(products)
        .set({ categoryId: catId })
        .where(inArray(products.id, batch));
    }
    console.log(`  ${catName}: ${ids.length} products`);
  }

  console.log(`Categories: ${allCategories.length}`);
  console.log("Migration complete!");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
