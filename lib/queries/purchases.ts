import { unstable_cache } from "next/cache";
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
import { z } from "zod";

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
      customName: purchaseItems.customName,
      qty: purchaseItems.qty,
      rate: purchaseItems.rate,
      amount: purchaseItems.amount,
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

const purchaseItemSchema = z.object({
  productId: z.number().optional().nullable(),
  customName: z.string().optional(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  discountType: z.enum(["percent", "value"]).default("percent"),
  discountValue: z.number().min(0).default(0),
});

const createPurchaseSchema = z.object({
  supplierId: z.number(),
  invoiceNo: z.string().optional(),
  paymentType: z.enum(["credit", "cash"]),
  notes: z.string().optional(),
  handlingCharges: z.number().nonnegative().optional().default(0),
  paidAmount: z.number().nonnegative().optional(),
  items: z.array(purchaseItemSchema).min(1),
});

export async function createPurchase(input: z.infer<typeof createPurchaseSchema>) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const data = createPurchaseSchema.parse(input);

  let subtotal = 0;
  const lineItems = data.items.map((item) => {
    const amount = calculateLineAmount(
      item.qty,
      item.rate,
      item.discountValue,
      item.discountType
    );
    subtotal += amount;
    return { ...item, amount };
  });
  subtotal = Math.round(subtotal * 100) / 100;

  const purchase = await db.transaction(async (tx) => {
    const handling = data.handlingCharges ?? 0;
    const grandTotal = subtotal + handling;
    const paidAmount = data.paymentType === "cash"
      ? grandTotal
      : (data.paidAmount ?? 0);

    const [created] = await tx
      .insert(purchases)
      .values({
        supplierId: data.supplierId,
        invoiceNo: data.invoiceNo,
        paymentType: data.paymentType,
        subtotal: subtotal.toFixed(2),
        gstTotal: "0",
        grandTotal: grandTotal.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        handlingCharges: handling.toFixed(2),
        notes: data.notes,
      })
      .returning();

    for (const item of lineItems) {
      await tx.insert(purchaseItems).values({
        purchaseId: created.id,
        productId: item.productId || null,
        customName: item.customName || null,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        discountType: item.discountType,
        discountValue: item.discountValue.toFixed(2),
        amount: item.amount.toFixed(2),
      });

      if (item.productId) {
        const effectiveRate = item.amount / item.qty; // after line discount
        const landedRate = subtotal > 0
          ? effectiveRate * (1 + handling / subtotal)
          : effectiveRate;

        const [product] = await tx
          .select({ stockQty: products.stockQty, purchaseRate: products.purchaseRate })
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);

        let newPurchaseRate = landedRate;
        if (product) {
          const currentStock = parseFloat(product.stockQty);
          const currentRate = parseFloat(product.purchaseRate);
          const totalStock = currentStock + item.qty;
          if (totalStock > 0) {
            newPurchaseRate = ((currentStock * currentRate) + (item.qty * landedRate)) / totalStock;
          }
        }

        await tx
          .update(products)
          .set({
            stockQty: sql`${products.stockQty}::numeric + ${item.qty}`,
            purchaseRate: newPurchaseRate.toFixed(2),
          })
          .where(eq(products.id, item.productId));

        await tx.insert(stockMovements).values({
          productId: item.productId,
          type: "purchase",
          qtyDelta: item.qty.toFixed(2),
          referenceId: created.id,
        });
      }
    }

    await tx
      .update(suppliers)
      .set({
        totalPurchased: sql`${suppliers.totalPurchased}::numeric + ${grandTotal}`,
      })
      .where(eq(suppliers.id, data.supplierId));

    return created;
  });

  revalidateTag("purchases", "max");
  revalidateTag("products", "max");
  revalidateTag("suppliers", "max");
  revalidatePath("/purchases");
  revalidatePath("/products");
  revalidatePath("/suppliers");
  revalidatePath("/");

  return purchase;
}
