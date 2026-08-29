/**
 * Live-DB smoke checks for Skywin 17-item punch-list, Phase 4.
 *   - Item 11: an "others" bill computes a full GST breakdown.
 *   - Item 3: editing one batch's sale rate survives a product-level rate change.
 *   - Item 17: a gram product bills as weight x per-gram rate.
 * Run: tsx --env-file=.env.local scripts/smoke-skywin-17-phase4.ts
 */
import Module from "node:module";

const originalLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "next/cache") {
    return {
      revalidatePath: () => undefined,
      revalidateTag: () => undefined,
      unstable_cache: (fn: unknown) => fn,
    };
  }
  return originalLoad(request, parent, isMain);
};

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok -", msg);
}

async function main() {
  const { db } = await import("@/db");
  const { products, productBatches } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { createSale } = await import("@/lib/queries/sales");
  const { updateProduct, updateBatch, getProductBatches } = await import("@/lib/queries/products");
  const { toNumber } = await import("@/lib/utils");

  const tag = Date.now();

  // ---- Item 17 + 11: gram product, "others" bill ----
  const [gramProd] = await db
    .insert(products)
    .values({
      name: `Smoke Gram ${tag}`,
      sku: `SMK17P4G-${tag}`,
      barcode: `SMK17P4G-${tag}`,
      unit: "Gram",
      purchaseRate: "1",
      saleRate: "2",
      gstRate: "5",
      hsnCode: "31010099",
      stockQty: "0",
    })
    .returning();
  await db.insert(productBatches).values({
    productId: gramProd.id,
    batchNumber: `BG-${tag}`,
    qty: "5000",
    purchaseRate: "1",
    saleRate: "2",
  });
  await db.update(products).set({ stockQty: "5000" }).where(eq(products.id, gramProd.id));
  const [gBatch] = await db
    .select()
    .from(productBatches)
    .where(eq(productBatches.productId, gramProd.id))
    .limit(1);

  const othersSale = await createSale({
    billType: "others",
    paymentMode: "cash",
    operatorName: "smoke",
    items: [
      { productId: gramProd.id, qty: 250, rate: 2, gstRate: 5, batchId: gBatch.id },
    ],
  });
  assert(othersSale.billType === "others", "sale stored with billType 'others'");
  assert(
    toNumber(othersSale.subtotal) === 500,
    `line value = 250g x Rs2 = Rs500 (got ${othersSale.subtotal})`
  );
  assert(
    toNumber(othersSale.cgst) > 0 && toNumber(othersSale.sgst) > 0,
    "others bill has a CGST/SGST breakdown"
  );

  // ---- Item 3: per-batch price survives a product rate change ----
  const [multiProd] = await db
    .insert(products)
    .values({
      name: `Smoke Multi ${tag}`,
      sku: `SMK17P4M-${tag}`,
      barcode: `SMK17P4M-${tag}`,
      unit: "Pcs",
      purchaseRate: "40",
      saleRate: "100",
      gstRate: "5",
      hsnCode: "31010099",
      stockQty: "0",
    })
    .returning();
  await db.insert(productBatches).values([
    { productId: multiProd.id, batchNumber: `M1-${tag}`, qty: "10", purchaseRate: "40", saleRate: "100" },
    { productId: multiProd.id, batchNumber: `M2-${tag}`, qty: "10", purchaseRate: "40", saleRate: "100" },
  ]);
  const batchesBefore = await getProductBatches(multiProd.id);
  const b1 = batchesBefore[0];

  await updateBatch(b1.id, { saleRate: 125 });
  await updateProduct(multiProd.id, {
    saleRate: 150,
    gstRate: 5,
    hsnCode: "31010099",
  });

  const batchesAfter = await getProductBatches(multiProd.id);
  const b1After = batchesAfter.find((b) => b.id === b1.id)!;
  const b2After = batchesAfter.find((b) => b.id !== b1.id)!;
  assert(
    toNumber(b1After.saleRate) === 125 && b1After.saleRateOverridden,
    "hand-edited batch keeps its custom sale rate after product rate change"
  );
  assert(
    toNumber(b2After.saleRate) === 150,
    "untouched batch follows the new product sale rate"
  );

  console.log("\nAll Phase 4 smoke checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
