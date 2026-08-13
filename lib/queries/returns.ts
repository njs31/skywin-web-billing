import { db } from "@/db";
import {
  saleReturns,
  saleReturnItems,
  products,
  stockMovements,
  sales,
  purchaseReturns,
  purchaseReturnItems,
  purchases,
  suppliers,
  customers,
} from "@/db/schema";
import {
  calculateGstBreakdown,
  calculateLineAmount,
} from "@/lib/gst";
import { format } from "date-fns";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const returnItemSchema = z.object({
  productId: z.number(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.number().nonnegative(),
});

const createReturnSchema = z.object({
  saleId: z.number().optional(),
  customerId: z.number().optional(),
  customerGstin: z.string().optional().nullable(),
  reason: z.string().optional(),
  items: z.array(returnItemSchema).min(1),
});

function normalizeGstin(value?: string | null) {
  const cleaned = value?.trim().toUpperCase() || "";
  return cleaned || null;
}

function isValidGstin(gstin: string) {
  // Standard 15-char Indian GSTIN format
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin);
}

async function generateReturnNo(tx: DbOrTx) {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `RET-${today}-`;
  const rows = (await tx.execute(sql`
    select coalesce(max(nullif(substring(return_no from '([0-9]+)$'), '')::int), 0) + 1 as next_seq
    from sale_returns
    where return_no like ${prefix + "%"}
  `)) as unknown as Array<{ next_seq: number | string }>;
  const seq = Number(rows[0]?.next_seq ?? 1);
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createSaleReturn(input: z.infer<typeof createReturnSchema>) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const data = createReturnSchema.parse(input);

  let customerGstin = normalizeGstin(data.customerGstin);

  if (data.customerId) {
    const { customers } = await import("@/db/schema");
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, data.customerId))
      .limit(1);

    if (!customer) {
      throw new Error("Selected customer was not found.");
    }

    if (!customerGstin) {
      customerGstin = normalizeGstin(customer.gstin);
    }

    if (customer.type === "wholesale") {
      if (!customerGstin) {
        throw new Error(
          "GSTIN is required for wholesale customer returns. Enter their GST number to continue."
        );
      }
      if (!isValidGstin(customerGstin)) {
        throw new Error(
          "Invalid GSTIN format. Enter a valid 15-character GST number (e.g. 33AAAAA0000A1Z5)."
        );
      }
    }
  }

  if (customerGstin && !isValidGstin(customerGstin)) {
    throw new Error(
      "Invalid GSTIN format. Enter a valid 15-character GST number (e.g. 33AAAAA0000A1Z5)."
    );
  }

  const gst = calculateGstBreakdown(
    data.items.map((i) => ({
      qty: i.qty,
      rate: i.rate,
      gstRate: i.gstRate,
    }))
  );

  const saleReturn = await db.transaction(async (tx) => {
    const returnNo = await generateReturnNo(tx);

    if (data.customerId && customerGstin) {
      const { customers } = await import("@/db/schema");
      const [existingGst] = await tx
        .select()
        .from(customers)
        .where(
          sql`upper(${customers.gstin}) = ${customerGstin} AND ${customers.id} <> ${data.customerId}`
        )
        .limit(1);
      if (existingGst) {
        throw new Error(
          `GSTIN "${customerGstin}" is already registered to "${existingGst.name}".`
        );
      }

      await tx
        .update(customers)
        .set({ gstin: customerGstin })
        .where(eq(customers.id, data.customerId));
    }

    const [created] = await tx
      .insert(saleReturns)
      .values({
        returnNo,
        saleId: data.saleId,
        customerId: data.customerId,
        customerGstin,
        subtotal: gst.subtotal.toFixed(2),
        cgst: gst.cgst.toFixed(2),
        sgst: gst.sgst.toFixed(2),
        grandTotal: gst.grandTotal.toFixed(2),
        reason: data.reason,
      })
      .returning();

    for (const item of data.items) {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);
      if (!product || !product.hsnCode || !product.hsnCode.trim()) {
        throw new Error(`HSN code is mandatory for all credit note items.`);
      }

      const amount = calculateLineAmount(item.qty, item.rate);
      await tx.insert(saleReturnItems).values({
        returnId: created.id,
        productId: item.productId,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        gstRate: item.gstRate.toFixed(2),
        amount: amount.toFixed(2),
        hsnCode: product.hsnCode,
      });

      const { addStockToBatch, defaultBatchNumber } = await import("@/lib/batches");
      const batch = await addStockToBatch(tx, {
        productId: item.productId,
        batchNumber: defaultBatchNumber("RET"),
        qty: item.qty,
        purchaseRate: parseFloat(product.purchaseRate),
        saleRate: parseFloat(product.saleRate),
        expiryDate: product.expiryDate,
        notes: data.reason || "Sales return",
      });

      await tx.insert(stockMovements).values({
        productId: item.productId,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        type: "return",
        qtyDelta: item.qty.toFixed(2),
        referenceId: created.id,
        notes: data.reason,
      });
    }

    return created;
  });

  revalidateTag("sales", "max");
  revalidateTag("products", "max");
  revalidateTag("customers", "max");
  revalidatePath("/returns");
  revalidatePath("/products");
  revalidatePath("/stock");
  revalidatePath("/customers");

  const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
  scheduleQwicksStockPush(data.items.map((item) => item.productId));

  return saleReturn;
}

export async function getSaleReturns() {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const query = db
    .select({
      id: saleReturns.id,
      returnNo: saleReturns.returnNo,
      date: saleReturns.date,
      grandTotal: saleReturns.grandTotal,
      reason: saleReturns.reason,
      customerGstin: saleReturns.customerGstin,
      customerName: customers.name,
      saleInvoiceNo: sales.invoiceNo,
    })
    .from(saleReturns)
    .leftJoin(sales, eq(saleReturns.saleId, sales.id))
    .leftJoin(customers, eq(saleReturns.customerId, customers.id));

  if (customerIds !== null) {
    if (customerIds.length === 0) return [];
    return query
      .where(inArray(saleReturns.customerId, customerIds))
      .orderBy(desc(saleReturns.date))
      .limit(100);
  }

  return query.orderBy(desc(saleReturns.date)).limit(100);
}

export async function getSaleReturnById(id: number) {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const [ret] = await db
    .select({
      id: saleReturns.id,
      returnNo: saleReturns.returnNo,
      saleId: saleReturns.saleId,
      customerId: saleReturns.customerId,
      customerGstin: saleReturns.customerGstin,
      date: saleReturns.date,
      subtotal: saleReturns.subtotal,
      cgst: saleReturns.cgst,
      sgst: saleReturns.sgst,
      grandTotal: saleReturns.grandTotal,
      reason: saleReturns.reason,
      createdAt: saleReturns.createdAt,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerAddress: customers.address,
      saleInvoiceNo: sales.invoiceNo,
    })
    .from(saleReturns)
    .leftJoin(sales, eq(saleReturns.saleId, sales.id))
    .leftJoin(customers, eq(saleReturns.customerId, customers.id))
    .where(eq(saleReturns.id, id))
    .limit(1);
  if (!ret) return null;

  // Scoping protection check
  if (customerIds !== null) {
    if (!ret.customerId || !customerIds.includes(ret.customerId)) {
      throw new Error("Unauthorized access to this return record.");
    }
  }

  const items = await db
    .select({
      productName: products.name,
      customName: saleReturnItems.customName,
      qty: saleReturnItems.qty,
      rate: saleReturnItems.rate,
      gstRate: saleReturnItems.gstRate,
      amount: saleReturnItems.amount,
      hsnCode: sql<string>`coalesce(${saleReturnItems.hsnCode}, ${products.hsnCode})`,
    })
    .from(saleReturnItems)
    .leftJoin(products, eq(saleReturnItems.productId, products.id))
    .where(eq(saleReturnItems.returnId, id));

  return { ...ret, items };
}

const purchaseReturnItemSchema = z.object({
  productId: z.number().optional().nullable(),
  customName: z.string().optional(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.number().nonnegative().default(0),
  hsnCode: z.string().optional().nullable(),
});

const createPurchaseReturnSchema = z.object({
  purchaseId: z.number().optional(),
  supplierId: z.number(),
  reason: z.string().optional(),
  items: z.array(purchaseReturnItemSchema).min(1),
});

async function generateDebitReturnNo(tx: DbOrTx) {
  const { getIndianFinancialYearBounds } = await import("@/lib/financial-year");
  const { start: fyStart, end: fyEnd } = getIndianFinancialYearBounds();
  const fyStartIso = fyStart.toISOString();
  const fyEndIso = fyEnd.toISOString();
  // #region agent log
  fetch('http://127.0.0.1:7653/ingest/8527ae0c-cbc0-4ad4-8c36-67cc03d92a10',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'36a287'},body:JSON.stringify({sessionId:'36a287',runId:'pre-fix',hypothesisId:'B',location:'lib/queries/returns.ts:generateDebitReturnNo',message:'DN FY bounds as ISO',data:{fyStartIso,fyEndIso},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const rows = (await tx.execute(sql`
    select coalesce(max(nullif(substring(return_no from '([0-9]+)$'), '')::int), 0) + 1 as next_seq
    from purchase_returns
    where (
      return_no ~ '^DN[0-9]+$'
      or return_no like 'DEB-%'
    )
      and date >= ${fyStartIso}::timestamptz
      and date <= ${fyEndIso}::timestamptz
  `)) as unknown as Array<{ next_seq: number | string }>;
  const seq = Number(rows[0]?.next_seq ?? 1);
  return `DN${String(seq).padStart(5, "0")}`;
}

export async function createPurchaseReturn(input: z.infer<typeof createPurchaseReturnSchema>) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const data = createPurchaseReturnSchema.parse(input);

  const gst = calculateGstBreakdown(
    data.items.map((i) => ({
      qty: i.qty,
      rate: i.rate,
      gstRate: i.gstRate,
    }))
  );

  const purchaseReturn = await db.transaction(async (tx) => {
    const returnNo = await generateDebitReturnNo(tx);

    const [created] = await tx
      .insert(purchaseReturns)
      .values({
        returnNo,
        purchaseId: data.purchaseId,
        supplierId: data.supplierId,
        subtotal: gst.subtotal.toFixed(2),
        cgst: gst.cgst.toFixed(2),
        sgst: gst.sgst.toFixed(2),
        igst: gst.igst.toFixed(2),
        grandTotal: gst.grandTotal.toFixed(2),
        reason: data.reason,
      })
      .returning();

    for (const item of data.items) {
      let itemHsn = item.hsnCode;
      if (item.productId) {
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);
        if (product && !itemHsn) itemHsn = product.hsnCode;
      }
      if (!itemHsn || !itemHsn.trim()) {
        throw new Error(`HSN code is mandatory for all debit note items.`);
      }

      const amount = calculateLineAmount(item.qty, item.rate);
      await tx.insert(purchaseReturnItems).values({
        returnId: created.id,
        productId: item.productId || null,
        customName: item.customName || null,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        gstRate: item.gstRate.toFixed(2),
        amount: amount.toFixed(2),
        hsnCode: itemHsn,
      });

      if (item.productId) {
        const { deductStockFefo } = await import("@/lib/batches");
        const deductions = await deductStockFefo(tx, item.productId, item.qty);

        for (const d of deductions) {
          await tx.insert(stockMovements).values({
            productId: item.productId,
            batchId: d.batchId,
            batchNumber: d.batchNumber,
            type: "return",
            qtyDelta: (-d.qty).toFixed(2),
            referenceId: created.id,
            notes: `Debit Note: ${data.reason || "Supplier Return"}`,
          });
        }
      }
    }

    return created;
  });

  revalidateTag("purchases", "max");
  revalidateTag("products", "max");
  revalidateTag("suppliers", "max");
  revalidatePath("/returns");
  revalidatePath("/products");
  revalidatePath("/stock");

  const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
  scheduleQwicksStockPush(
    data.items
      .map((item) => item.productId)
      .filter((id): id is number => typeof id === "number")
  );

  return purchaseReturn;
}

export async function getPurchaseReturns() {
  return db
    .select({
      id: purchaseReturns.id,
      returnNo: purchaseReturns.returnNo,
      date: purchaseReturns.date,
      grandTotal: purchaseReturns.grandTotal,
      reason: purchaseReturns.reason,
      purchaseInvoiceNo: purchases.invoiceNo,
      supplierName: suppliers.name,
    })
    .from(purchaseReturns)
    .leftJoin(purchases, eq(purchaseReturns.purchaseId, purchases.id))
    .innerJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id))
    .orderBy(desc(purchaseReturns.date))
    .limit(100);
}

export async function getPurchaseReturnById(id: number) {
  const [ret] = await db
    .select({
      id: purchaseReturns.id,
      returnNo: purchaseReturns.returnNo,
      purchaseId: purchaseReturns.purchaseId,
      supplierId: purchaseReturns.supplierId,
      date: purchaseReturns.date,
      subtotal: purchaseReturns.subtotal,
      cgst: purchaseReturns.cgst,
      sgst: purchaseReturns.sgst,
      igst: purchaseReturns.igst,
      grandTotal: purchaseReturns.grandTotal,
      reason: purchaseReturns.reason,
      createdAt: purchaseReturns.createdAt,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      supplierAddress: suppliers.address,
      supplierGstin: suppliers.gstin,
      purchaseInvoiceNo: purchases.invoiceNo,
    })
    .from(purchaseReturns)
    .leftJoin(purchases, eq(purchaseReturns.purchaseId, purchases.id))
    .innerJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id))
    .where(eq(purchaseReturns.id, id))
    .limit(1);

  if (!ret) return null;

  const items = await db
    .select({
      productName: products.name,
      customName: purchaseReturnItems.customName,
      qty: purchaseReturnItems.qty,
      rate: purchaseReturnItems.rate,
      gstRate: purchaseReturnItems.gstRate,
      amount: purchaseReturnItems.amount,
      hsnCode: sql<string>`coalesce(${purchaseReturnItems.hsnCode}, ${products.hsnCode})`,
    })
    .from(purchaseReturnItems)
    .leftJoin(products, eq(purchaseReturnItems.productId, products.id))
    .where(eq(purchaseReturnItems.returnId, id));

  return { ...ret, items };
}
