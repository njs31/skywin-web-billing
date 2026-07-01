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
} from "@/db/schema";
import {
  calculateGstBreakdown,
  calculateLineAmount,
} from "@/lib/gst";
import { format } from "date-fns";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const returnItemSchema = z.object({
  productId: z.number(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.number().nonnegative(),
});

const createReturnSchema = z.object({
  saleId: z.number().optional(),
  customerId: z.number().optional(),
  reason: z.string().optional(),
  items: z.array(returnItemSchema).min(1),
});

async function generateReturnNo() {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `RET-${today}-`;
  const [last] = await db
    .select({ returnNo: saleReturns.returnNo })
    .from(saleReturns)
    .where(sql`${saleReturns.returnNo} like ${prefix + "%"}`)
    .orderBy(desc(saleReturns.returnNo))
    .limit(1);
  let seq = 1;
  if (last?.returnNo) {
    seq = parseInt(last.returnNo.split("-").pop() ?? "0", 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createSaleReturn(input: z.infer<typeof createReturnSchema>) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const data = createReturnSchema.parse(input);

  const gst = calculateGstBreakdown(
    data.items.map((i) => ({
      qty: i.qty,
      rate: i.rate,
      gstRate: i.gstRate,
    }))
  );

  const returnNo = await generateReturnNo();

  const saleReturn = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(saleReturns)
      .values({
        returnNo,
        saleId: data.saleId,
        customerId: data.customerId,
        subtotal: gst.subtotal.toFixed(2),
        cgst: gst.cgst.toFixed(2),
        sgst: gst.sgst.toFixed(2),
        grandTotal: gst.grandTotal.toFixed(2),
        reason: data.reason,
      })
      .returning();

    for (const item of data.items) {
      const amount = calculateLineAmount(item.qty, item.rate);
      await tx.insert(saleReturnItems).values({
        returnId: created.id,
        productId: item.productId,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        gstRate: item.gstRate.toFixed(2),
        amount: amount.toFixed(2),
      });

      await tx
        .update(products)
        .set({
          stockQty: sql`${products.stockQty}::numeric + ${item.qty}`,
        })
        .where(eq(products.id, item.productId));

      await tx.insert(stockMovements).values({
        productId: item.productId,
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
      saleInvoiceNo: sales.invoiceNo,
    })
    .from(saleReturns)
    .leftJoin(sales, eq(saleReturns.saleId, sales.id));

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
    .select()
    .from(saleReturns)
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
      amount: saleReturnItems.amount,
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
});

const createPurchaseReturnSchema = z.object({
  purchaseId: z.number().optional(),
  supplierId: z.number(),
  reason: z.string().optional(),
  items: z.array(purchaseReturnItemSchema).min(1),
});

async function generateDebitReturnNo() {
  const today = format(new Date(), "yyyyMMdd");
  const prefix = `DEB-${today}-`;
  const [last] = await db
    .select({ returnNo: purchaseReturns.returnNo })
    .from(purchaseReturns)
    .where(sql`${purchaseReturns.returnNo} like ${prefix + "%"}`)
    .orderBy(desc(purchaseReturns.returnNo))
    .limit(1);
  let seq = 1;
  if (last?.returnNo) {
    seq = parseInt(last.returnNo.split("-").pop() ?? "0", 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createPurchaseReturn(input: z.infer<typeof createPurchaseReturnSchema>) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const data = createPurchaseReturnSchema.parse(input);

  let subtotal = 0;
  for (const item of data.items) {
    subtotal += item.qty * item.rate;
  }
  const grandTotal = Math.round(subtotal * 100) / 100;
  const returnNo = await generateDebitReturnNo();

  const purchaseReturn = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(purchaseReturns)
      .values({
        returnNo,
        purchaseId: data.purchaseId,
        supplierId: data.supplierId,
        subtotal: grandTotal.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        reason: data.reason,
      })
      .returning();

    for (const item of data.items) {
      const amount = item.qty * item.rate;
      await tx.insert(purchaseReturnItems).values({
        returnId: created.id,
        productId: item.productId || null,
        customName: item.customName || null,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        amount: amount.toFixed(2),
      });

      if (item.productId) {
        await tx
          .update(products)
          .set({
            stockQty: sql`${products.stockQty}::numeric - ${item.qty}`,
          })
          .where(eq(products.id, item.productId));

        await tx.insert(stockMovements).values({
          productId: item.productId,
          type: "return",
          qtyDelta: (-item.qty).toFixed(2),
          referenceId: created.id,
          notes: `Debit Note: ${data.reason || "Supplier Return"}`,
        });
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
      date: purchaseReturns.date,
      grandTotal: purchaseReturns.grandTotal,
      reason: purchaseReturns.reason,
      supplierName: suppliers.name,
    })
    .from(purchaseReturns)
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
      amount: purchaseReturnItems.amount,
    })
    .from(purchaseReturnItems)
    .leftJoin(products, eq(purchaseReturnItems.productId, products.id))
    .where(eq(purchaseReturnItems.returnId, id));

  return { ...ret, items };
}
