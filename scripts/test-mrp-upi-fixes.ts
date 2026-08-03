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
  const { db } = await import("@/db");
  const { products, productBatches, sales, customers } = await import("@/db/schema");
  const { updateProduct, searchProductBatches } = await import("@/lib/queries/products");
  const { createSale, getSaleById } = await import("@/lib/queries/sales");
  const { eq, and, sql, gt } = await import("drizzle-orm");

  // Pick a product with stock
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), gt(products.stockQty, "0")))
    .limit(1);
  if (!product) throw new Error("No in-stock product");

  const newRate = Math.round((parseFloat(product.saleRate) + 11.11) * 100) / 100;
  await updateProduct(product.id, {
    saleRate: newRate,
    gstRate: parseFloat(product.gstRate),
    hsnCode: product.hsnCode || "998311",
    mrp: newRate + 20,
  });

  const [batch] = await db
    .select()
    .from(productBatches)
    .where(eq(productBatches.productId, product.id))
    .limit(1);
  if (!batch) throw new Error("No batch for product");
  if (parseFloat(batch.saleRate ?? "0") !== newRate) {
    throw new Error(
      `Batch rate not synced: batch=${batch.saleRate} expected=${newRate}`
    );
  }

  const rows = await searchProductBatches(product.name.slice(0, 8), 5, {
    onlyInStock: false,
  });
  const match = rows.find((r) => r.productId === product.id);
  if (!match) throw new Error("Product not found in search");
  if (parseFloat(match.saleRate) !== newRate) {
    throw new Error(`Search still has old product rate: ${match.saleRate}`);
  }
  console.log("1. MRP/sale rate sync OK:", product.name, "->", newRate);

  const [customer] = await db.select().from(customers).limit(1);
  const upiSale = await createSale({
    billType: "retail",
    customerId: customer?.id,
    customerName: customer?.name ?? "Walk-in",
    paymentMode: "upi",
    // intentionally omit cash/upi to verify server-side normalization
    items: [
      {
        productId: product.id,
        qty: 1,
        rate: newRate,
        gstRate: parseFloat(product.gstRate) || 0,
        discountType: "percent" as const,
        discountValue: 0,
      },
    ],
  });

  const invoice = await getSaleById(upiSale.id);
  if (!invoice) throw new Error("invoice missing");
  const paid = parseFloat(invoice.paidAmount ?? "0");
  const total = parseFloat(invoice.grandTotal);
  const upiAmt = parseFloat(invoice.upiAmount ?? "0");
  if (Math.abs(paid - total) > 0.01) {
    throw new Error(`UPI sale unpaid: paid=${paid} total=${total}`);
  }
  if (Math.abs(upiAmt - total) > 0.01) {
    throw new Error(`UPI amount not set: upi=${upiAmt} total=${total}`);
  }
  if (invoice.paymentMode !== "upi") {
    throw new Error(`Expected upi mode, got ${invoice.paymentMode}`);
  }
  console.log(
    "2. UPI payment status OK:",
    invoice.invoiceNo,
    `paid=${paid} upi=${upiAmt} status=PAID`
  );

  // restore a sane rate roughly (optional)
  console.log("\nAll bugfix checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
