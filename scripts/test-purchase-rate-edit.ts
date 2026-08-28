/**
 * Exercises the real updateProduct path for the editable purchase rate.
 * Point DATABASE_URL at a disposable branch before running — it writes.
 *
 * Run: npx tsx --env-file=<branch env> scripts/test-purchase-rate-edit.ts
 */
const failures: string[] = [];

function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(label);
}

async function main() {
  // This writes to whatever DATABASE_URL points at. Make running it against
  // the shop's live database an explicit, deliberate act.
  if (process.env.ALLOW_DB_WRITE_TEST !== "1") {
    console.error(
      "Refusing to run: this test writes to the database.\n" +
        "Point DATABASE_URL at a disposable branch, then set ALLOW_DB_WRITE_TEST=1."
    );
    process.exit(1);
  }

  const { db } = await import("../db");
  const { products, productBatches } = await import("../db/schema");
  const { updateProduct } = await import("../lib/queries/products");
  const { eq } = await import("drizzle-orm");

  const [target] = await db
    .select({
      id: products.id,
      name: products.name,
      purchaseRate: products.purchaseRate,
      saleRate: products.saleRate,
      gstRate: products.gstRate,
      hsnCode: products.hsnCode,
    })
    .from(products)
    .limit(1);

  if (!target) throw new Error("No products in this database to test against.");
  console.log(`Testing on #${target.id} "${target.name}"\n`);

  const base = {
    saleRate: Number(target.saleRate),
    gstRate: Number(target.gstRate),
    hsnCode: target.hsnCode ?? undefined,
    name: target.name,
  };

  const batchesBefore = await db
    .select({ id: productBatches.id, purchaseRate: productBatches.purchaseRate })
    .from(productBatches)
    .where(eq(productBatches.productId, target.id));

  const original = Number(target.purchaseRate);
  const wanted = Math.round((original + 37.25) * 100) / 100;

  await updateProduct(target.id, { ...base, purchaseRate: wanted });

  const [after] = await db
    .select({
      purchaseRate: products.purchaseRate,
      saleRate: products.saleRate,
      gstRate: products.gstRate,
    })
    .from(products)
    .where(eq(products.id, target.id));

  check(
    "purchase rate is saved",
    Number(after!.purchaseRate) === wanted,
    `${original} -> ${after!.purchaseRate}`
  );
  check("sale rate is untouched", Number(after!.saleRate) === base.saleRate);
  check("GST is untouched", Number(after!.gstRate) === base.gstRate);

  const batchesAfter = await db
    .select({ id: productBatches.id, purchaseRate: productBatches.purchaseRate })
    .from(productBatches)
    .where(eq(productBatches.productId, target.id));

  // Each batch purchase rate is the real cost of that lot. Editing the
  // product's current cost must not rewrite cost history.
  const historyIntact = batchesBefore.every((before) => {
    const found = batchesAfter.find((b) => b.id === before.id);
    return found && String(found.purchaseRate) === String(before.purchaseRate);
  });
  check(
    "batch cost history is preserved",
    historyIntact,
    `${batchesBefore.length} batch(es) checked`
  );

  // Decimals must survive the numeric(14,2) column.
  await updateProduct(target.id, { ...base, purchaseRate: 1234.56 });
  const [decimals] = await db
    .select({ purchaseRate: products.purchaseRate })
    .from(products)
    .where(eq(products.id, target.id));
  check(
    "two decimal places survive a round trip",
    Number(decimals!.purchaseRate) === 1234.56,
    String(decimals!.purchaseRate)
  );

  let rejected = false;
  try {
    await updateProduct(target.id, { ...base, purchaseRate: -5 });
  } catch (error) {
    rejected = /purchase rate cannot be negative/i.test(
      error instanceof Error ? error.message : ""
    );
  }
  check("a negative purchase rate is rejected", rejected);

  // Omitting the field must leave the stored rate alone.
  await updateProduct(target.id, base);
  const [omitted] = await db
    .select({ purchaseRate: products.purchaseRate })
    .from(products)
    .where(eq(products.id, target.id));
  check(
    "omitting purchase rate leaves it unchanged",
    Number(omitted!.purchaseRate) === 1234.56,
    String(omitted!.purchaseRate)
  );

  console.log(
    failures.length
      ? `\n${failures.length} FAILED: ${failures.join(", ")}`
      : "\nAll checks passed."
  );
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
