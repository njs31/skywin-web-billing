/**
 * Live-DB smoke checks for Skywin 17-item punch-list, Phase 3.
 *   - Item 4: QwicksApp order ingestion is idempotent.
 *   - Item 14: cancelling a sale restores stock, reverses the receipt,
 *     marks it cancelled and drops it from the sales report.
 * Run: tsx --env-file=.env.local scripts/smoke-skywin-17-phase3.ts
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
  const { products, productBatches, sales } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { createSale, cancelSale, getSalesReport } = await import("@/lib/queries/sales");
  const { processQwicksOrderPlaced } = await import("@/lib/queries/qwicks");
  const { toNumber } = await import("@/lib/utils");

  const tag = Date.now();
  const sku = `SMK17P3-${tag}`;

  const [prod] = await db
    .insert(products)
    .values({
      name: `Smoke P3 ${tag}`,
      sku,
      barcode: sku,
      unit: "pcs",
      purchaseRate: "40",
      saleRate: "100",
      gstRate: "5",
      hsnCode: "31010099",
      stockQty: "0",
    })
    .returning();

  await db.insert(productBatches).values({
    productId: prod.id,
    batchNumber: `B-${tag}`,
    qty: "100",
    purchaseRate: "40",
    saleRate: "100",
  });
  await db.update(products).set({ stockQty: "100" }).where(eq(products.id, prod.id));

  const [batch] = await db
    .select()
    .from(productBatches)
    .where(eq(productBatches.productId, prod.id))
    .limit(1);

  // ---- Item 14: cancel sale ----
  const sale = await createSale({
    billType: "retail",
    paymentMode: "cash",
    operatorName: "smoke",
    items: [
      { productId: prod.id, qty: 10, rate: 100, gstRate: 5, batchId: batch.id },
    ],
  });
  assert(sale.status === "active", "new sale is active");

  const [afterSale] = await db.select().from(products).where(eq(products.id, prod.id));
  assert(toNumber(afterSale.stockQty) === 90, "stock deducted to 90 after sale");

  const today = new Date().toISOString().slice(0, 10);
  const reportBefore = await getSalesReport(today, today);
  assert(
    reportBefore.invoices.some((i) => i.invoiceNo === sale.invoiceNo),
    "sale appears in the sales report before cancel"
  );

  await cancelSale(sale.id, "smoke test cancel", "smoke");

  const [afterCancel] = await db.select().from(products).where(eq(products.id, prod.id));
  assert(toNumber(afterCancel.stockQty) === 100, "stock restored to 100 after cancel");

  const [batchAfter] = await db
    .select()
    .from(productBatches)
    .where(eq(productBatches.id, batch.id));
  assert(toNumber(batchAfter.qty) === 100, "batch qty restored to 100");

  const [saleAfter] = await db.select().from(sales).where(eq(sales.id, sale.id));
  assert(saleAfter.status === "cancelled", "sale marked cancelled");
  assert(saleAfter.invoiceNo === sale.invoiceNo, "invoice number kept");

  const reportAfter = await getSalesReport(today, today);
  assert(
    !reportAfter.invoices.some((i) => i.invoiceNo === sale.invoiceNo),
    "cancelled sale is excluded from the sales report"
  );

  // ---- Item 4: Qwicks idempotency ----
  const orderId = `SMK-ORDER-${tag}`;
  const body = {
    orderId,
    customer: { name: "Smoke Qwicks", phone: `9${tag}`.slice(0, 10) },
    paymentMode: "cash",
    items: [{ productCode: sku, qty: 2, unitPrice: 100 }],
  };
  const first = await processQwicksOrderPlaced({ ...body });
  const second = await processQwicksOrderPlaced({ ...body });
  assert(second.duplicate === true, "second identical Qwicks webhook is a no-op");
  assert(first.saleId === second.saleId, "same invoice returned for the retried order");

  const qwicksSales = await db
    .select()
    .from(sales)
    .where(eq(sales.externalOrderId, orderId));
  assert(qwicksSales.length === 1, "exactly one sale row for the Qwicks order");
  assert(qwicksSales[0].paymentMode === "cash", "Qwicks payment mode honoured (cash)");

  console.log("\nAll Phase 3 smoke checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
