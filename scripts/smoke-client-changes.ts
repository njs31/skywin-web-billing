/**
 * End-to-end smoke checks for client change requests against live DB.
 * Avoids next/cache revalidate by exercising DB/query logic with a local stub.
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
  const { db } = await import("@/db");
  const {
    products,
    customers,
    sales,
    partyPaymentAllocations,
    suppliers,
    purchases,
  } = await import("@/db/schema");
  const { createProduct } = await import("@/lib/queries/products");
  const { createPurchase } = await import("@/lib/queries/purchases");
  const { createSale, getSaleById } = await import("@/lib/queries/sales");
  const { createPartyPayment } = await import("@/lib/queries/payments");
  const {
    createCustomer,
    updateCustomer,
    getCustomerOutstanding,
  } = await import("@/lib/queries/customers");
  const { eq } = await import("drizzle-orm");

  const results: string[] = [];

  const [exempt] = await db
    .select({
      barcode: products.barcode,
      gstRate: products.gstRate,
      name: products.name,
    })
    .from(products)
    .where(eq(products.gstRate, "0.00"))
    .limit(1);
  if (!exempt) throw new Error("No 0% GST products found");
  results.push(`1. GST exempt OK: ${exempt.barcode} @ ${exempt.gstRate}%`);

  const product = await createProduct({
    name: `TEST PRODUCT ${Date.now()}`,
    hsnCode: "998311",
    purchaseRate: 100,
    saleRate: 120,
    gstRate: 0,
    stockQty: 5,
    unit: "pcs",
  });
  if (!product) throw new Error("createProduct failed");
  const [reloaded] = await db
    .select()
    .from(products)
    .where(eq(products.id, product.id))
    .limit(1);
  if (parseFloat(reloaded.gstRate) !== 0) throw new Error("0% GST not preserved");
  if (parseFloat(reloaded.stockQty) !== 5) {
    throw new Error(`Expected stock 5, got ${reloaded.stockQty}`);
  }
  if (!reloaded.barcode) throw new Error("Barcode not assigned");
  results.push(
    `2. New product OK: id=${reloaded.id} barcode=${reloaded.barcode} stock=${reloaded.stockQty}`
  );

  const customer = await createCustomer({
    name: `TEST CUST ${Date.now()}`,
    phone: "9000000001",
    type: "retail",
    address: "12 Test Street, Trichy",
    membershipNo: "MEM-100",
  });
  await updateCustomer(customer.id, {
    name: customer.name,
    phone: "9000000002",
    membershipNo: "MEM-200",
    address: customer.address ?? undefined,
    type: "retail",
    creditLimit: 0,
  });
  const [cust] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customer.id))
    .limit(1);
  if (cust.phone !== "9000000002" || cust.membershipNo !== "MEM-200") {
    throw new Error("Customer edit failed");
  }
  results.push(`3. Customer edit OK: phone=${cust.phone} membership=${cust.membershipNo}`);

  const [supplier] = await db.select().from(suppliers).limit(1);
  if (!supplier) throw new Error("Need at least one supplier");
  const purchaseName = `MANUAL ITEM ${Date.now()}`;
  const purchase = await createPurchase({
    supplierId: supplier.id,
    paymentType: "cash",
    items: [
      {
        customName: purchaseName,
        qty: 3,
        rate: 50,
        hsnCode: "998311",
        gstRate: 5,
        saleRate: 70,
        batchNumber: "OPENING",
      },
    ],
  });
  const [manualProduct] = await db
    .select()
    .from(products)
    .where(eq(products.name, purchaseName))
    .limit(1);
  if (!manualProduct || parseFloat(manualProduct.stockQty) < 3) {
    throw new Error("Manual purchase did not create stocked product");
  }
  if (parseFloat(manualProduct.gstRate) !== 5) {
    throw new Error(`Manual product GST expected 5, got ${manualProduct.gstRate}`);
  }
  results.push(
    `4. Manual purchase OK: purchase=${purchase.id} product=${manualProduct.id} stock=${manualProduct.stockQty} gst=${manualProduct.gstRate}`
  );

  const creditSale = await createSale({
    billType: "retail",
    customerId: customer.id,
    customerName: customer.name,
    paymentMode: "credit",
    paidAmount: 0,
    items: [
      {
        productId: reloaded.id,
        qty: 1,
        rate: 200,
        gstRate: 0,
      },
    ],
  });

  const splitSale = await createSale({
    billType: "retail",
    customerId: customer.id,
    customerName: customer.name,
    paymentMode: "cash",
    cashAmount: 50,
    upiAmount: 70,
    items: [
      {
        productId: reloaded.id,
        qty: 1,
        rate: 120,
        gstRate: 0,
      },
    ],
  });

  const invoice = await getSaleById(splitSale.id);
  if (!invoice) throw new Error("getSaleById failed");
  if (invoice.customerAddress !== "12 Test Street, Trichy") {
    throw new Error(`Address missing on invoice: ${invoice.customerAddress}`);
  }
  if (
    parseFloat(invoice.cashAmount ?? "0") !== 50 ||
    parseFloat(invoice.upiAmount ?? "0") !== 70
  ) {
    throw new Error(
      `Split amounts wrong: cash=${invoice.cashAmount} upi=${invoice.upiAmount}`
    );
  }
  results.push(
    `5. Split sale + address OK: ${splitSale.invoiceNo} cash=${invoice.cashAmount} upi=${invoice.upiAmount}`
  );

  const before = await getCustomerOutstanding(customer.id);
  await createPartyPayment({
    type: "receipt",
    customerId: customer.id,
    amount: 200,
    paymentMode: "cash",
    allocations: [{ saleId: creditSale.id, amount: 200 }],
  });
  const after = await getCustomerOutstanding(customer.id);
  const [paidSale] = await db
    .select({ paidAmount: sales.paidAmount, grandTotal: sales.grandTotal })
    .from(sales)
    .where(eq(sales.id, creditSale.id))
    .limit(1);
  if (parseFloat(paidSale.paidAmount ?? "0") < 200) {
    throw new Error(`Receipt did not update paidAmount: ${paidSale.paidAmount}`);
  }
  const [alloc] = await db
    .select()
    .from(partyPaymentAllocations)
    .where(eq(partyPaymentAllocations.saleId, creditSale.id))
    .limit(1);
  if (!alloc) throw new Error("Allocation row missing");
  results.push(
    `6. Receipt allocation OK: outstanding ${before} -> ${after}, paid=${paidSale.paidAmount}`
  );

  const creditPurchase = await createPurchase({
    supplierId: supplier.id,
    paymentType: "credit",
    paidAmount: 0,
    items: [
      {
        productId: manualProduct.id,
        qty: 1,
        rate: 50,
        hsnCode: manualProduct.hsnCode,
        batchNumber: "PAYTEST",
      },
    ],
  });
  await createPartyPayment({
    type: "payment",
    supplierId: supplier.id,
    amount: 50,
    paymentMode: "cash",
    allocations: [{ purchaseId: creditPurchase.id, amount: 50 }],
  });
  const [paidPurchase] = await db
    .select({ paidAmount: purchases.paidAmount })
    .from(purchases)
    .where(eq(purchases.id, creditPurchase.id))
    .limit(1);
  if (parseFloat(paidPurchase.paidAmount ?? "0") < 50) {
    throw new Error(`Payment did not update purchase paidAmount: ${paidPurchase.paidAmount}`);
  }
  results.push(`7. Payment allocation OK: purchase=${creditPurchase.id}`);

  console.log("\nAll smoke checks passed:\n");
  for (const line of results) console.log(" -", line);
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
