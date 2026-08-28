import { unstable_cache } from "next/cache";
import { db } from "@/db";
import {
  purchases,
  purchaseItems,
  products,
  stockMovements,
  suppliers,
  purchaseReturns,
  partyPaymentAllocations,
} from "@/db/schema";
import { calculateLineAmount, calculateGstBreakdown, isInterstateGst } from "@/lib/gst";
import { getSettings } from "@/lib/settings";
import { and, desc, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { toNumber } from "@/lib/utils";

export const getPurchases = unstable_cache(
  async () =>
    db
      .select({
        id: purchases.id,
        invoiceNo: purchases.invoiceNo,
        date: purchases.date,
        paymentType: purchases.paymentType,
        grandTotal: purchases.grandTotal,
        supplierName: suppliers.name,
      })
      .from(purchases)
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .orderBy(desc(purchases.date))
      .limit(100),
  ["purchases-list"],
  { revalidate: 30, tags: ["purchases"] }
);

export async function getPurchaseById(id: number) {
  const [purchase] = await db
    .select({
      id: purchases.id,
      invoiceNo: purchases.invoiceNo,
      date: purchases.date,
      paymentType: purchases.paymentType,
      subtotal: purchases.subtotal,
      gstTotal: purchases.gstTotal,
      grandTotal: purchases.grandTotal,
      handlingCharges: purchases.handlingCharges,
      paidAmount: purchases.paidAmount,
      notes: purchases.notes,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      supplierGstin: suppliers.gstin,
      supplierAddress: suppliers.address,
      supplierState: suppliers.state,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(eq(purchases.id, id))
    .limit(1);

  if (!purchase) return null;

  const items = await db
    .select({
      id: purchaseItems.id,
      productId: purchaseItems.productId,
      productName: products.name,
      customName: purchaseItems.customName,
      qty: purchaseItems.qty,
      rate: purchaseItems.rate,
      amount: purchaseItems.amount,
      discountType: purchaseItems.discountType,
      discountValue: purchaseItems.discountValue,
      batchNumber: purchaseItems.batchNumber,
      expiryDate: purchaseItems.expiryDate,
      hsnCode: sql<string>`coalesce(${purchaseItems.hsnCode}, ${products.hsnCode})`,
      gstRate: sql<string>`coalesce(nullif(${purchaseItems.gstRate}::numeric, 0), ${products.gstRate}::numeric, 0)`,
      product: products,
    })
    .from(purchaseItems)
    .leftJoin(products, eq(purchaseItems.productId, products.id))
    .where(eq(purchaseItems.purchaseId, id));

  return { ...purchase, items };
}

export async function getPurchasesBySupplier(supplierId: number) {
  return db
    .select()
    .from(purchases)
    .where(eq(purchases.supplierId, supplierId))
    .orderBy(desc(purchases.date));
}

export type PurchaseInvoiceOption = {
  id: number;
  invoiceNo: string | null;
  date: Date;
  supplierId: number;
  supplierName: string;
  grandTotal: string;
};

/** Search purchases for purchase-return "against bill" picker. */
export async function searchPurchasesForReturn(
  query: string,
  options?: { supplierId?: number; limit?: number }
): Promise<PurchaseInvoiceOption[]> {
  const q = query.trim();
  const limit = options?.limit ?? 20;
  const filters = [];

  if (options?.supplierId) {
    filters.push(eq(purchases.supplierId, options.supplierId));
  }
  if (q) {
    filters.push(
      sql`(
        coalesce(${purchases.invoiceNo}, '') ilike ${"%" + q + "%"}
        or ${suppliers.name} ilike ${"%" + q + "%"}
      )`
    );
  }

  return db
    .select({
      id: purchases.id,
      invoiceNo: purchases.invoiceNo,
      date: purchases.date,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
      grandTotal: purchases.grandTotal,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(purchases.date))
    .limit(limit);
}

const purchaseItemSchema = z.object({
  productId: z.number().optional().nullable(),
  customName: z.string().optional(),
  qty: z.number().int().positive("Quantity must be a whole number"),
  rate: z.number().nonnegative(),
  discountType: z.enum(["percent", "value"]).default("percent"),
  discountValue: z.number().min(0).default(0),
  hsnCode: z.string().optional().nullable(),
  batchNumber: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  gstRate: z.number().nonnegative().optional().default(0),
  saleRate: z.number().nonnegative().optional(),
});

const createPurchaseSchema = z.object({
  supplierId: z.number(),
  invoiceNo: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentType: z.enum(["credit", "cash"]),
  notes: z.string().optional(),
  handlingCharges: z.number().nonnegative().optional().default(0),
  paidAmount: z.number().nonnegative().optional(),
  items: z.array(purchaseItemSchema).min(1),
});

export async function createPurchase(input: z.infer<typeof createPurchaseSchema>) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const data = createPurchaseSchema.parse(input);
  const settings = await getSettings();

  const [supplier] = await db
    .select({ gstin: suppliers.gstin })
    .from(suppliers)
    .where(eq(suppliers.id, data.supplierId))
    .limit(1);
  if (!supplier) throw new Error("Supplier not found");

  const resolvedItems: Array<
    (typeof data.items)[number] & { amount: number; gstRate: number; hsnCode: string }
  > = [];

  for (const item of data.items) {
    let itemHsn = item.hsnCode ?? null;
    let gstRate = item.gstRate ?? 0;
    if (item.productId) {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);
      if (product) {
        if (!itemHsn) itemHsn = product.hsnCode;
        if (!gstRate) gstRate = toNumber(product.gstRate);
      }
    }
    if (!itemHsn || !itemHsn.trim()) {
      throw new Error(`HSN code is mandatory for all purchase items.`);
    }
    const amount = calculateLineAmount(
      item.qty,
      item.rate,
      item.discountValue,
      item.discountType
    );
    resolvedItems.push({
      ...item,
      hsnCode: itemHsn.trim(),
      gstRate,
      amount,
    });
  }

  const interstate = isInterstateGst(supplier.gstin, settings.stateCode);
  const gst = calculateGstBreakdown(
    resolvedItems.map((item) => ({
      qty: item.qty,
      rate: item.rate,
      gstRate: item.gstRate,
      discountType: item.discountType,
      discountValue: item.discountValue,
    })),
    { interstate }
  );
  const subtotal = gst.taxableAmount;
  const gstTotal = Math.round((gst.cgst + gst.sgst + gst.igst) * 100) / 100;

  const purchase = await db.transaction(async (tx) => {
    const handling = data.handlingCharges ?? 0;
    const grandTotal = Math.round((gst.grandTotal + handling) * 100) / 100;
    const paidAmount = data.paymentType === "cash"
      ? grandTotal
      : (data.paidAmount ?? 0);

    const [created] = await tx
      .insert(purchases)
      .values({
        supplierId: data.supplierId,
        invoiceNo: data.invoiceNo,
        date: new Date(`${data.date}T12:00:00+05:30`),
        paymentType: data.paymentType,
        subtotal: subtotal.toFixed(2),
        gstTotal: gstTotal.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        handlingCharges: handling.toFixed(2),
        notes: data.notes,
      })
      .returning();

    const touchedProductIds: number[] = [];

    for (const item of resolvedItems) {
      let productId = item.productId || null;

      // Manual purchase lines become real inventory products so they can be billed.
      if (!productId && item.customName?.trim()) {
        const saleRate = item.saleRate ?? item.rate;
        const [createdProduct] = await tx
          .insert(products)
          .values({
            name: item.customName.trim(),
            unit: "pcs",
            purchaseRate: item.rate.toFixed(2),
            saleRate: saleRate.toFixed(2),
            wholesaleRate: saleRate.toFixed(2),
            stockQty: "0.00",
            hsnCode: item.hsnCode,
            gstRate: item.gstRate.toFixed(2),
            expiryDate: item.expiryDate || null,
            isActive: true,
          })
          .returning();

        const barcode = `SW${String(createdProduct.id).padStart(6, "0")}`;
        await tx
          .update(products)
          .set({ barcode, sku: barcode })
          .where(eq(products.id, createdProduct.id));

        productId = createdProduct.id;
      }

      await tx.insert(purchaseItems).values({
        purchaseId: created.id,
        productId,
        customName: item.customName || null,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        discountType: item.discountType,
        discountValue: item.discountValue.toFixed(2),
        amount: item.amount.toFixed(2),
        hsnCode: item.hsnCode || null,
        gstRate: item.gstRate.toFixed(2),
        batchNumber: item.batchNumber?.trim().toUpperCase() || null,
        expiryDate: item.expiryDate || null,
      });

      if (productId) {
        const effectiveRate = item.amount / item.qty; // after line discount
        const landedRate = subtotal > 0
          ? effectiveRate * (1 + handling / subtotal)
          : effectiveRate;

        const { addStockToBatch, defaultBatchNumber } = await import("@/lib/batches");
        const batchNumber =
          item.batchNumber?.trim().toUpperCase() ||
          defaultBatchNumber("PUR");

        const batch = await addStockToBatch(tx, {
          productId,
          batchNumber,
          qty: item.qty,
          purchaseRate: landedRate,
          saleRate: item.saleRate ?? item.rate,
          expiryDate: item.expiryDate || null,
          notes: data.invoiceNo
            ? `Purchase ${data.invoiceNo}`
            : `Purchase #${created.id}`,
        });

        await tx.insert(stockMovements).values({
          productId,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          type: "purchase",
          qtyDelta: item.qty.toFixed(2),
          referenceId: created.id,
        });

        touchedProductIds.push(productId);
      }
    }

    await tx
      .update(suppliers)
      .set({
        totalPurchased: sql`${suppliers.totalPurchased}::numeric + ${grandTotal.toFixed(2)}`,
      })
      .where(eq(suppliers.id, data.supplierId));

    return { created, touchedProductIds };
  });

  revalidateTag("purchases", "max");
  revalidateTag("products", "max");
  revalidateTag("suppliers", "max");
  revalidatePath("/purchases");
  revalidatePath("/products");
  revalidatePath("/suppliers");
  revalidatePath("/");

  const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
  scheduleQwicksStockPush(purchase.touchedProductIds);

  return purchase.created;
}

const updatePurchaseSchema = createPurchaseSchema.extend({
  id: z.number().int().positive(),
});

async function reversePurchaseStock(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  purchaseId: number
) {
  const { deductFromBatch } = await import("@/lib/batches");
  const movements = await tx
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.type, "purchase"),
        eq(stockMovements.referenceId, purchaseId)
      )
    );

  const productIds: number[] = [];
  for (const movement of movements) {
    const qty = toNumber(movement.qtyDelta);
    if (qty <= 0) continue;
    if (movement.batchId) {
      await deductFromBatch(tx, movement.batchId, qty, movement.productId);
    } else {
      const { deductStockFefo } = await import("@/lib/batches");
      await deductStockFefo(tx, movement.productId, qty);
    }
    productIds.push(movement.productId);
  }

  await tx
    .delete(stockMovements)
    .where(
      and(
        eq(stockMovements.type, "purchase"),
        eq(stockMovements.referenceId, purchaseId)
      )
    );

  return productIds;
}

async function applyPurchaseLines(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  purchaseId: number,
  data: z.infer<typeof createPurchaseSchema>,
  resolvedItems: Array<
    (typeof data.items)[number] & { amount: number; gstRate: number; hsnCode: string }
  >,
  subtotal: number
) {
  const touchedProductIds: number[] = [];

  for (const item of resolvedItems) {
    let productId = item.productId || null;

    if (!productId && item.customName?.trim()) {
      const saleRate = item.saleRate ?? item.rate;
      const [createdProduct] = await tx
        .insert(products)
        .values({
          name: item.customName.trim(),
          unit: "pcs",
          purchaseRate: item.rate.toFixed(2),
          saleRate: saleRate.toFixed(2),
          wholesaleRate: saleRate.toFixed(2),
          stockQty: "0.00",
          hsnCode: item.hsnCode,
          gstRate: item.gstRate.toFixed(2),
          expiryDate: item.expiryDate || null,
          isActive: true,
        })
        .returning();

      const barcode = `SW${String(createdProduct.id).padStart(6, "0")}`;
      await tx
        .update(products)
        .set({ barcode, sku: barcode })
        .where(eq(products.id, createdProduct.id));

      productId = createdProduct.id;
    }

    await tx.insert(purchaseItems).values({
      purchaseId,
      productId,
      customName: item.customName || null,
      qty: item.qty.toFixed(2),
      rate: item.rate.toFixed(2),
      discountType: item.discountType,
      discountValue: item.discountValue.toFixed(2),
      amount: item.amount.toFixed(2),
      hsnCode: item.hsnCode || null,
      gstRate: item.gstRate.toFixed(2),
      batchNumber: item.batchNumber?.trim().toUpperCase() || null,
      expiryDate: item.expiryDate || null,
    });

    if (productId) {
      const effectiveRate = item.amount / item.qty;
      const landedRate =
        subtotal > 0 ? effectiveRate * (1 + (data.handlingCharges ?? 0) / subtotal) : effectiveRate;

      const { addStockToBatch, defaultBatchNumber } = await import("@/lib/batches");
      const batchNumber =
        item.batchNumber?.trim().toUpperCase() || defaultBatchNumber("PUR");

      const batch = await addStockToBatch(tx, {
        productId,
        batchNumber,
        qty: item.qty,
        purchaseRate: landedRate,
        saleRate: item.saleRate ?? item.rate,
        expiryDate: item.expiryDate || null,
        notes: data.invoiceNo
          ? `Purchase ${data.invoiceNo}`
          : `Purchase #${purchaseId}`,
      });

      await tx.insert(stockMovements).values({
        productId,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        type: "purchase",
        qtyDelta: item.qty.toFixed(2),
        referenceId: purchaseId,
      });

      touchedProductIds.push(productId);
    }
  }

  return touchedProductIds;
}

export async function updatePurchase(input: z.infer<typeof updatePurchaseSchema>) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const data = updatePurchaseSchema.parse(input);
  const settings = await getSettings();

  const [existing] = await db
    .select()
    .from(purchases)
    .where(eq(purchases.id, data.id))
    .limit(1);
  if (!existing) throw new Error("Purchase bill not found");

  const [linkedReturn] = await db
    .select({ id: purchaseReturns.id })
    .from(purchaseReturns)
    .where(eq(purchaseReturns.purchaseId, data.id))
    .limit(1);
  if (linkedReturn) {
    throw new Error("Cannot edit a purchase bill that has purchase returns.");
  }

  const [linkedPayment] = await db
    .select({ id: partyPaymentAllocations.id })
    .from(partyPaymentAllocations)
    .where(eq(partyPaymentAllocations.purchaseId, data.id))
    .limit(1);
  if (linkedPayment) {
    throw new Error(
      "Cannot edit a purchase bill with payment allocations. Remove payment allocations first."
    );
  }

  const [supplier] = await db
    .select({ gstin: suppliers.gstin })
    .from(suppliers)
    .where(eq(suppliers.id, data.supplierId))
    .limit(1);
  if (!supplier) throw new Error("Supplier not found");

  const resolvedItems: Array<
    (typeof data.items)[number] & { amount: number; gstRate: number; hsnCode: string }
  > = [];

  for (const item of data.items) {
    let itemHsn = item.hsnCode ?? null;
    let gstRate = item.gstRate ?? 0;
    if (item.productId) {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);
      if (product) {
        if (!itemHsn) itemHsn = product.hsnCode;
        if (!gstRate) gstRate = toNumber(product.gstRate);
      }
    }
    if (!itemHsn || !itemHsn.trim()) {
      throw new Error(`HSN code is mandatory for all purchase items.`);
    }
    const amount = calculateLineAmount(
      item.qty,
      item.rate,
      item.discountValue,
      item.discountType
    );
    resolvedItems.push({
      ...item,
      hsnCode: itemHsn.trim(),
      gstRate,
      amount,
    });
  }

  const interstate = isInterstateGst(supplier.gstin, settings.stateCode);
  const gst = calculateGstBreakdown(
    resolvedItems.map((item) => ({
      qty: item.qty,
      rate: item.rate,
      gstRate: item.gstRate,
      discountType: item.discountType,
      discountValue: item.discountValue,
    })),
    { interstate }
  );
  const subtotal = gst.taxableAmount;
  const gstTotal = Math.round((gst.cgst + gst.sgst + gst.igst) * 100) / 100;
  const handling = data.handlingCharges ?? 0;
  const grandTotal = Math.round((gst.grandTotal + handling) * 100) / 100;
  const paidAmount =
    data.paymentType === "cash" ? grandTotal : (data.paidAmount ?? 0);

  const oldGrandTotal = toNumber(existing.grandTotal);
  const oldSupplierId = existing.supplierId;

  const result = await db.transaction(async (tx) => {
    const reversedProductIds = await reversePurchaseStock(tx, data.id);

    await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, data.id));

    await tx
      .update(purchases)
      .set({
        supplierId: data.supplierId,
        invoiceNo: data.invoiceNo,
        date: new Date(`${data.date}T12:00:00+05:30`),
        paymentType: data.paymentType,
        subtotal: subtotal.toFixed(2),
        gstTotal: gstTotal.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        handlingCharges: handling.toFixed(2),
        notes: data.notes,
      })
      .where(eq(purchases.id, data.id));

    const touchedProductIds = await applyPurchaseLines(
      tx,
      data.id,
      data,
      resolvedItems,
      subtotal
    );

    await tx
      .update(suppliers)
      .set({
        totalPurchased: sql`${suppliers.totalPurchased}::numeric - ${oldGrandTotal.toFixed(2)}`,
      })
      .where(eq(suppliers.id, oldSupplierId));

    await tx
      .update(suppliers)
      .set({
        totalPurchased: sql`${suppliers.totalPurchased}::numeric + ${grandTotal.toFixed(2)}`,
      })
      .where(eq(suppliers.id, data.supplierId));

    return {
      id: data.id,
      touchedProductIds: [...new Set([...reversedProductIds, ...touchedProductIds])],
    };
  });

  revalidateTag("purchases", "max");
  revalidateTag("products", "max");
  revalidateTag("suppliers", "max");
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${data.id}`);
  revalidatePath("/products");
  revalidatePath("/suppliers");
  revalidatePath("/");

  const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
  scheduleQwicksStockPush(result.touchedProductIds);

  return { id: result.id };
}

export type PurchaseReportBill = {
  id: number;
  invoiceNo: string;
  date: Date;
  supplierName: string;
  paymentType: string;
  subtotal: number;
  gstTotal: number;
  handlingCharges: number;
  grandTotal: number;
  paidAmount: number;
};

export type PurchaseReportLineItem = {
  invoiceNo: string;
  date: Date;
  supplierName: string;
  paymentType: string;
  productName: string;
  hsnCode: string;
  batchNumber: string;
  qty: number;
  rate: number;
  amount: number;
};

export type PurchaseReportData = {
  fromDate: string;
  toDate: string;
  summary: {
    billCount: number;
    subtotal: number;
    gstTotal: number;
    handlingCharges: number;
    grandTotal: number;
    paidAmount: number;
    byPaymentType: Record<string, { count: number; amount: number }>;
  };
  bills: PurchaseReportBill[];
  lineItems: PurchaseReportLineItem[];
};

function toNum(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getPurchaseReport(
  fromDate: string,
  toDate: string
): Promise<PurchaseReportData> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  if (fromDate > toDate) {
    throw new Error("From date cannot be after To date.");
  }

  const from = new Date(`${fromDate}T00:00:00+05:30`);
  const to = new Date(`${toDate}T23:59:59.999+05:30`);

  const billRows = await db
    .select({
      id: purchases.id,
      invoiceNo: purchases.invoiceNo,
      date: purchases.date,
      paymentType: purchases.paymentType,
      subtotal: purchases.subtotal,
      gstTotal: purchases.gstTotal,
      handlingCharges: purchases.handlingCharges,
      grandTotal: purchases.grandTotal,
      paidAmount: purchases.paidAmount,
      supplierName: suppliers.name,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(and(gte(purchases.date, from), lte(purchases.date, to)))
    .orderBy(desc(purchases.date));

  const bills: PurchaseReportBill[] = billRows.map((row) => ({
    id: row.id,
    invoiceNo: row.invoiceNo?.trim() || `PUR-${row.id}`,
    date: row.date,
    supplierName: row.supplierName,
    paymentType: row.paymentType,
    subtotal: toNum(row.subtotal),
    gstTotal: toNum(row.gstTotal),
    handlingCharges: toNum(row.handlingCharges),
    grandTotal: toNum(row.grandTotal),
    paidAmount: toNum(row.paidAmount),
  }));

  const purchaseIds = bills.map((b) => b.id);
  let lineItems: PurchaseReportLineItem[] = [];

  if (purchaseIds.length > 0) {
    const itemRows = await db
      .select({
        invoiceNo: purchases.invoiceNo,
        purchaseId: purchases.id,
        date: purchases.date,
        paymentType: purchases.paymentType,
        supplierName: suppliers.name,
        productName: products.name,
        customName: purchaseItems.customName,
        hsnCode: sql<string>`coalesce(${purchaseItems.hsnCode}, ${products.hsnCode})`,
        batchNumber: purchaseItems.batchNumber,
        qty: purchaseItems.qty,
        rate: purchaseItems.rate,
        amount: purchaseItems.amount,
      })
      .from(purchaseItems)
      .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .leftJoin(products, eq(purchaseItems.productId, products.id))
      .where(inArray(purchaseItems.purchaseId, purchaseIds))
      .orderBy(desc(purchases.date), purchaseItems.id);

    lineItems = itemRows.map((row) => ({
      invoiceNo: row.invoiceNo?.trim() || `PUR-${row.purchaseId}`,
      date: row.date,
      supplierName: row.supplierName,
      paymentType: row.paymentType,
      productName: row.productName || row.customName || "Item",
      hsnCode: row.hsnCode || "",
      batchNumber: row.batchNumber || "",
      qty: toNum(row.qty),
      rate: toNum(row.rate),
      amount: toNum(row.amount),
    }));
  }

  const byPaymentType: Record<string, { count: number; amount: number }> = {};
  let subtotal = 0;
  let gstTotal = 0;
  let handlingCharges = 0;
  let grandTotal = 0;
  let paidAmount = 0;

  for (const bill of bills) {
    subtotal += bill.subtotal;
    gstTotal += bill.gstTotal;
    handlingCharges += bill.handlingCharges;
    grandTotal += bill.grandTotal;
    paidAmount += bill.paidAmount;
    const mode = bill.paymentType || "credit";
    if (!byPaymentType[mode]) byPaymentType[mode] = { count: 0, amount: 0 };
    byPaymentType[mode].count++;
    byPaymentType[mode].amount += bill.grandTotal;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    fromDate,
    toDate,
    summary: {
      billCount: bills.length,
      subtotal: round2(subtotal),
      gstTotal: round2(gstTotal),
      handlingCharges: round2(handlingCharges),
      grandTotal: round2(grandTotal),
      paidAmount: round2(paidAmount),
      byPaymentType,
    },
    bills,
    lineItems,
  };
}
