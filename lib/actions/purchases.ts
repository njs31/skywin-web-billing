"use server";

import { db } from "@/db";
import {
  purchases,
  purchaseItems,
  products,
  stockMovements,
  suppliers,
} from "@/db/schema";
import { calculateLineAmount } from "@/lib/gst";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const purchaseItemSchema = z.object({
  productId: z.number(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
});

const createPurchaseSchema = z.object({
  supplierId: z.number(),
  invoiceNo: z.string().optional(),
  paymentType: z.enum(["credit", "cash"]),
  notes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1),
});

export async function getPurchases() {
  return db
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
    .limit(100);
}

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
      notes: purchases.notes,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
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
      qty: purchaseItems.qty,
      rate: purchaseItems.rate,
      amount: purchaseItems.amount,
    })
    .from(purchaseItems)
    .innerJoin(products, eq(purchaseItems.productId, products.id))
    .where(eq(purchaseItems.purchaseId, id));

  return { ...purchase, items };
}

export async function createPurchase(input: z.infer<typeof createPurchaseSchema>) {
  const data = createPurchaseSchema.parse(input);

  let subtotal = 0;
  const lineItems = data.items.map((item) => {
    const amount = calculateLineAmount(item.qty, item.rate);
    subtotal += amount;
    return { ...item, amount };
  });
  subtotal = Math.round(subtotal * 100) / 100;

  const purchase = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(purchases)
      .values({
        supplierId: data.supplierId,
        invoiceNo: data.invoiceNo,
        paymentType: data.paymentType,
        subtotal: subtotal.toFixed(2),
        gstTotal: "0",
        grandTotal: subtotal.toFixed(2),
        notes: data.notes,
      })
      .returning();

    for (const item of lineItems) {
      await tx.insert(purchaseItems).values({
        purchaseId: created.id,
        productId: item.productId,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        amount: item.amount.toFixed(2),
      });

      await tx
        .update(products)
        .set({
          stockQty: sql`${products.stockQty}::numeric + ${item.qty}`,
          purchaseRate: item.rate.toFixed(2),
        })
        .where(eq(products.id, item.productId));

      await tx.insert(stockMovements).values({
        productId: item.productId,
        type: "purchase",
        qtyDelta: item.qty.toFixed(2),
        referenceId: created.id,
      });
    }

    await tx
      .update(suppliers)
      .set({
        totalPurchased: sql`${suppliers.totalPurchased}::numeric + ${subtotal}`,
      })
      .where(eq(suppliers.id, data.supplierId));

    return created;
  });

  revalidatePath("/purchases");
  revalidatePath("/products");
  revalidatePath("/suppliers");
  revalidatePath("/");

  return purchase;
}

export async function getPurchasesBySupplier(supplierId: number) {
  return db
    .select()
    .from(purchases)
    .where(eq(purchases.supplierId, supplierId))
    .orderBy(desc(purchases.date));
}
