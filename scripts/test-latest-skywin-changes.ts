/**
 * Live DB checks: purchase edit, Qwicks GST-inclusive price, POS qty helper.
 */
import Module from "node:module";

const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "next/cache") {
    return {
      revalidatePath: () => undefined,
      revalidateTag: () => undefined,
      unstable_cache: (fn: Function) => fn,
    };
  }
  return originalLoad(request, parent, isMain);
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("Skipping: DATABASE_URL not set.");
    process.exit(0);
  }

  const { db } = await import("@/db");
  const { products, suppliers, purchases, purchaseItems, stockMovements } =
    await import("@/db/schema");
  const { createProduct } = await import("@/lib/queries/products");
  const { createPurchase, getPurchaseById, updatePurchase } = await import(
    "@/lib/queries/purchases"
  );
  const { buildQwicksProductPayload } = await import("@/lib/queries/qwicks");
  const { inclusiveSalePrice, normalizeCartQty } = await import("@/lib/gst");
  const { eq, and } = await import("drizzle-orm");

  const stamp = Date.now();

  // 1. Qwicks GST-inclusive price
  const gstProduct = await createProduct({
    name: `TEST QWICKS GST ${stamp}`,
    hsnCode: "998311",
    purchaseRate: 100,
    saleRate: 100,
    gstRate: 12,
    stockQty: 5,
    reorderLevel: 0,
    unit: "pcs",
  });
  if (!gstProduct) throw new Error("createProduct failed");
  const [payload] = await buildQwicksProductPayload([gstProduct.id]);
  const expected = inclusiveSalePrice(100, 12);
  if (payload.salePrice !== expected || payload.price !== expected) {
    throw new Error(
      `Qwicks price expected ${expected}, got salePrice=${payload.salePrice} price=${payload.price}`
    );
  }
  console.log("1. Qwicks GST-inclusive price OK:", payload.salePrice);

  // 2. POS quantity helper
  if (normalizeCartQty(1000, 5000, true) !== 1000) {
    throw new Error("normalizeCartQty should allow 1000 when stock is 5000");
  }
  if (normalizeCartQty(1000, 50, true) !== null) {
    throw new Error("normalizeCartQty should block qty above stock");
  }
  console.log("2. POS quantity helper OK");

  // 3. Purchase edit
  const [supplier] = await db.select().from(suppliers).limit(1);
  if (!supplier) throw new Error("No supplier for purchase edit test");

  const batch = `TEST-${stamp}`;
  const purchaseProduct = await createProduct({
    name: `TEST PUR EDIT ${stamp}`,
    hsnCode: "998311",
    purchaseRate: 50,
    saleRate: 80,
    gstRate: 0,
    stockQty: 0,
    reorderLevel: 0,
    unit: "pcs",
  });
  if (!purchaseProduct) throw new Error("purchase product create failed");

  const created = await createPurchase({
    supplierId: supplier.id,
    invoiceNo: `TEST-${stamp}`,
    date: new Date().toISOString().slice(0, 10),
    paymentType: "cash",
    handlingCharges: 0,
    items: [
      {
        productId: purchaseProduct.id,
        qty: 10,
        rate: 50,
        discountType: "percent",
        discountValue: 0,
        batchNumber: batch,
        gstRate: 0,
        saleRate: 80,
      },
    ],
  });

  const before = await getPurchaseById(created.id);
  if (!before || before.items.length !== 1) {
    throw new Error("Purchase not loaded after create");
  }
  const stockBefore = parseFloat(
    (
      await db
        .select({ stockQty: products.stockQty })
        .from(products)
        .where(eq(products.id, purchaseProduct.id))
        .limit(1)
    )[0]!.stockQty
  );
  if (stockBefore !== 10) {
    throw new Error(`Expected stock 10 after purchase, got ${stockBefore}`);
  }

  await updatePurchase({
    id: created.id,
    supplierId: supplier.id,
    invoiceNo: `TEST-${stamp}-EDIT`,
    date: new Date().toISOString().slice(0, 10),
    paymentType: "cash",
    handlingCharges: 0,
    items: [
      {
        productId: purchaseProduct.id,
        qty: 15,
        rate: 55,
        discountType: "percent",
        discountValue: 0,
        batchNumber: batch,
        gstRate: 0,
        saleRate: 85,
      },
    ],
  });

  const after = await getPurchaseById(created.id);
  if (!after) throw new Error("Purchase missing after update");
  if (after.invoiceNo !== `TEST-${stamp}-EDIT`) {
    throw new Error(`Invoice not updated: ${after.invoiceNo}`);
  }
  if (parseFloat(after.grandTotal) !== 825) {
    throw new Error(`Expected grand total 825, got ${after.grandTotal}`);
  }
  const stockAfter = parseFloat(
    (
      await db
        .select({ stockQty: products.stockQty })
        .from(products)
        .where(eq(products.id, purchaseProduct.id))
        .limit(1)
    )[0]!.stockQty
  );
  if (stockAfter !== 15) {
    throw new Error(`Expected stock 15 after edit, got ${stockAfter}`);
  }

  const movements = await db
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.type, "purchase"),
        eq(stockMovements.referenceId, created.id)
      )
    );
  if (movements.length !== 1 || parseFloat(movements[0]!.qtyDelta) !== 15) {
    throw new Error("Stock movement not updated correctly after purchase edit");
  }

  // cleanup test purchase lines (leave product for audit trail)
  await db.delete(purchaseItems).where(eq(purchaseItems.purchaseId, created.id));
  await db
    .delete(stockMovements)
    .where(
      and(
        eq(stockMovements.type, "purchase"),
        eq(stockMovements.referenceId, created.id)
      )
    );
  await db.delete(purchases).where(eq(purchases.id, created.id));

  console.log("3. Purchase edit OK: stock 10→15, total 500→825");

  console.log("\nAll latest Skywin change checks passed.");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
