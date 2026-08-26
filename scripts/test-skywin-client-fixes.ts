/**
 * Live DB checks for Skywin client punch-list items.
 * Requires DATABASE_URL. Skips cleanly when the database is not configured.
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
    console.log("Skipping live DB checks: DATABASE_URL is not set.");
    process.exit(0);
  }

  const { db } = await import("@/db");
  const {
    products,
    customers,
    suppliers,
    sales,
    partyPayments,
    partyPaymentAllocations,
    purchaseOrders,
  } = await import("@/db/schema");
  const { createProduct } = await import("@/lib/queries/products");
  const { createSale, getSalesReport } = await import("@/lib/queries/sales");
  const { createPurchaseOrder } = await import("@/lib/queries/purchase-orders");
  const { eq, and, desc } = await import("drizzle-orm");
  const { formatWholesaleInvoiceNo, nextWholesaleSequence } = await import(
    "@/lib/financial-year"
  );

  const stamp = Date.now();
  const product = await createProduct({
    name: `TEST SKYWIN ${stamp}`,
    hsnCode: "998311",
    purchaseRate: 50,
    saleRate: 80,
    gstRate: 0,
    stockQty: 20,
    reorderLevel: 0,
    unit: "pcs",
  });
  if (!product) throw new Error("createProduct failed");

  const [customer] = await db
    .select()
    .from(customers)
    .limit(1);
  const buyer =
    customer ??
    (
      await db
        .insert(customers)
        .values({
          name: `Test Buyer ${stamp}`,
          type: "retail",
          creditLimit: "0.00",
        })
        .returning()
    )[0];

  const cashSale = await createSale({
    billType: "retail",
    customerId: buyer.id,
    customerName: buyer.name,
    paymentMode: "cash",
    items: [
      {
        productId: product.id,
        qty: 1,
        rate: 80,
        gstRate: 0,
        discountType: "percent" as const,
        discountValue: 0,
      },
    ],
  });
  const [cashReceipt] = await db
    .select()
    .from(partyPayments)
    .where(
      and(
        eq(partyPayments.customerId, buyer.id),
        eq(partyPayments.referenceNo, cashSale.invoiceNo)
      )
    )
    .limit(1);
  if (!cashReceipt) {
    throw new Error(`No auto credit/receipt for cash invoice ${cashSale.invoiceNo}`);
  }
  const [alloc] = await db
    .select()
    .from(partyPaymentAllocations)
    .where(eq(partyPaymentAllocations.paymentId, cashReceipt.id))
    .limit(1);
  if (!alloc || alloc.saleId !== cashSale.id) {
    throw new Error("Cash auto-receipt was not allocated to the sale");
  }
  console.log("1. Cash auto credit OK:", cashSale.invoiceNo, cashReceipt.paymentMode);

  const cardSale = await createSale({
    billType: "retail",
    customerId: buyer.id,
    customerName: buyer.name,
    paymentMode: "card",
    paidAmount: 80,
    items: [
      {
        productId: product.id,
        qty: 1,
        rate: 80,
        gstRate: 0,
        discountType: "percent" as const,
        discountValue: 0,
      },
    ],
  });
  const [cardReceipt] = await db
    .select()
    .from(partyPayments)
    .where(eq(partyPayments.referenceNo, cardSale.invoiceNo))
    .limit(1);
  if (!cardReceipt || cardReceipt.paymentMode !== "card") {
    throw new Error(`Card sale did not auto-credit: ${cardSale.invoiceNo}`);
  }
  console.log("2. Card auto credit OK:", cardSale.invoiceNo);

  const [supplier] = await db.select().from(suppliers).limit(1);
  if (!supplier) throw new Error("No supplier found for PO test");
  const po = await createPurchaseOrder({
    supplierId: supplier.id,
    supplierName: supplier.name,
    items: [
      {
        productId: product.id,
        qty: 1,
        rate: 50,
        gstRate: 0,
        hsnCode: "998311",
      },
    ],
  });
  const [savedPo] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, po.id))
    .limit(1);
  if (savedPo.supplierId !== supplier.id) {
    throw new Error("PO saved customer instead of supplier");
  }
  if (savedPo.customerId) {
    throw new Error("New PO should not store a customer id");
  }
  console.log("3. PO supplier OK:", po.poNumber, savedPo.supplierName);

  const today = new Date().toISOString().slice(0, 10);
  const report = await getSalesReport(today, today);
  for (let i = 1; i < report.invoices.length; i++) {
    const prev = report.invoices[i - 1];
    const cur = report.invoices[i];
    const prevT = new Date(prev.date).getTime();
    const curT = new Date(cur.date).getTime();
    if (prevT > curT) {
      throw new Error(
        `Sales report not ascending: ${prev.invoiceNo} after ${cur.invoiceNo}`
      );
    }
  }
  console.log("4. Sales report ascending OK:", report.invoices.length, "invoices");

  const [latestWholesale] = await db
    .select({ invoiceNo: sales.invoiceNo })
    .from(sales)
    .where(eq(sales.billType, "wholesale"))
    .orderBy(desc(sales.id))
    .limit(1);
  const expectedFirst = formatWholesaleInvoiceNo(nextWholesaleSequence(0), "26-27");
  console.log(
    "5. Wholesale series helper:",
    expectedFirst,
    "latest=",
    latestWholesale?.invoiceNo ?? "(none yet)"
  );

  console.log("\nAll live Skywin punch-list checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
