import { db } from "@/db";
import {
  purchaseOrders,
  purchaseOrderItems,
  products,
  suppliers,
} from "@/db/schema";
import { calculateLineAmount } from "@/lib/gst";
import { getIndianFinancialYearBounds } from "@/lib/financial-year";
import { desc, eq, sql, and, inArray } from "drizzle-orm";
import { z } from "zod";

const poItemSchema = z.object({
  productId: z.number().optional().nullable(),
  customName: z.string().optional(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.number().nonnegative().default(0),
  hsnCode: z.string().optional().nullable(),
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.number().optional(),
  supplierName: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(poItemSchema).min(1),
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function generatePoNumber(tx: DbOrTx) {
  const { start: fyStart, end: fyEnd } = getIndianFinancialYearBounds();
  const fyStartIso = fyStart.toISOString();
  const fyEndIso = fyEnd.toISOString();

  const rows = (await tx.execute(sql`
    select coalesce(max(nullif(substring(po_number from '([0-9]+)$'), '')::int), 0) + 1 as next_seq
    from purchase_orders
    where po_number ~ '^OP[0-9]+$'
      and date >= ${fyStartIso}::timestamptz
      and date <= ${fyEndIso}::timestamptz
  `)) as unknown as Array<{ next_seq: number | string }>;

  const seq = Number(rows[0]?.next_seq ?? 1);
  return `OP${String(seq).padStart(6, "0")}`;
}

export async function createPurchaseOrder(
  input: z.infer<typeof createPurchaseOrderSchema>
) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } =
    await import("@/lib/revalidate");
  const data = createPurchaseOrderSchema.parse(input);

  let supplierId = data.supplierId ?? null;
  let supplierName = data.supplierName?.trim() || null;

  if (supplierId) {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);
    if (!supplier) throw new Error("Selected supplier was not found.");
    supplierName = supplier.name;
  }

  if (!supplierId && !supplierName) {
    throw new Error("Select a supplier or enter a supplier name.");
  }

  const productIds = [
    ...new Set(
      data.items
        .map((item) => item.productId)
        .filter((id): id is number => typeof id === "number")
    ),
  ];
  const productGst = new Map<number, number>();
  if (productIds.length > 0) {
    const rows = await db
      .select({ id: products.id, gstRate: products.gstRate })
      .from(products)
      .where(inArray(products.id, productIds));
    for (const row of rows) {
      productGst.set(row.id, Number(row.gstRate ?? 0));
    }
  }

  const lineAmounts = data.items.map((item) =>
    calculateLineAmount(item.qty, item.rate)
  );
  const subtotal = round2(lineAmounts.reduce((s, a) => s + a, 0));

  const created = await db.transaction(async (tx) => {
    const poNumber = await generatePoNumber(tx);

    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        poNumber,
        supplierId,
        supplierName,
        notes: data.notes?.trim() || null,
        subtotal: subtotal.toFixed(2),
        grandTotal: subtotal.toFixed(2),
        status: "open",
      })
      .returning();

    await tx.insert(purchaseOrderItems).values(
      data.items.map((item, idx) => ({
        purchaseOrderId: po.id,
        productId: item.productId ?? null,
        customName: item.customName?.trim() || null,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        gstRate: (
          item.gstRate ||
          (item.productId ? productGst.get(item.productId) ?? 0 : 0)
        ).toFixed(2),
        amount: lineAmounts[idx].toFixed(2),
        hsnCode: item.hsnCode?.trim() || null,
      }))
    );

    return po;
  });

  revalidateTag("purchase-orders", "max");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${created.id}`);

  return created;
}

export async function getPurchaseOrders() {
  return db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      date: purchaseOrders.date,
      supplierId: purchaseOrders.supplierId,
      supplierName: purchaseOrders.supplierName,
      supplierRecordName: suppliers.name,
      subtotal: purchaseOrders.subtotal,
      grandTotal: purchaseOrders.grandTotal,
      status: purchaseOrders.status,
      notes: purchaseOrders.notes,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .orderBy(desc(purchaseOrders.date))
    .limit(500);
}

export async function getPurchaseOrderById(id: number) {
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      date: purchaseOrders.date,
      supplierId: purchaseOrders.supplierId,
      supplierName: purchaseOrders.supplierName,
      notes: purchaseOrders.notes,
      subtotal: purchaseOrders.subtotal,
      grandTotal: purchaseOrders.grandTotal,
      status: purchaseOrders.status,
      createdAt: purchaseOrders.createdAt,
      supplierRecordName: suppliers.name,
      supplierPhone: suppliers.phone,
      supplierGstin: suppliers.gstin,
      supplierAddress: suppliers.address,
      supplierCity: suppliers.city,
      supplierState: suppliers.state,
      supplierPinCode: suppliers.pinCode,
    })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.id, id))
    .limit(1);

  if (!po) return null;

  const items = await db
    .select({
      id: purchaseOrderItems.id,
      productId: purchaseOrderItems.productId,
      productName: products.name,
      customName: purchaseOrderItems.customName,
      hsnCode: sql<string>`coalesce(${purchaseOrderItems.hsnCode}, ${products.hsnCode})`,
      qty: purchaseOrderItems.qty,
      rate: purchaseOrderItems.rate,
      gstRate: sql<string>`coalesce(${purchaseOrderItems.gstRate}, ${products.gstRate}, 0)`,
      amount: purchaseOrderItems.amount,
      unit: products.unit,
    })
    .from(purchaseOrderItems)
    .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, id));

  return { ...po, items };
}

const updatePurchaseOrderSchema = z.object({
  id: z.number(),
  items: z
    .array(
      z.object({
        id: z.number(),
        qty: z.number().positive(),
        rate: z.number().nonnegative(),
      })
    )
    .min(1),
});

export async function updatePurchaseOrderAmounts(
  input: z.infer<typeof updatePurchaseOrderSchema>
) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } =
    await import("@/lib/revalidate");
  const data = updatePurchaseOrderSchema.parse(input);

  const [existing] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, data.id))
    .limit(1);
  if (!existing) throw new Error("Purchase order not found.");

  const lineAmounts = data.items.map((item) =>
    round2(calculateLineAmount(item.qty, item.rate))
  );
  const subtotal = round2(lineAmounts.reduce((s, a) => s + a, 0));

  await db.transaction(async (tx) => {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      await tx
        .update(purchaseOrderItems)
        .set({
          qty: item.qty.toFixed(2),
          rate: item.rate.toFixed(2),
          amount: lineAmounts[i].toFixed(2),
        })
        .where(
          and(
            eq(purchaseOrderItems.id, item.id),
            eq(purchaseOrderItems.purchaseOrderId, data.id)
          )
        );
    }
    await tx
      .update(purchaseOrders)
      .set({
        subtotal: subtotal.toFixed(2),
        grandTotal: subtotal.toFixed(2),
      })
      .where(eq(purchaseOrders.id, data.id));
  });

  revalidateTag("purchase-orders", "max");
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${data.id}`);

  return getPurchaseOrderById(data.id);
}
