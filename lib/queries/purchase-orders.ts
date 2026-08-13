import { db } from "@/db";
import {
  purchaseOrders,
  purchaseOrderItems,
  products,
  customers,
} from "@/db/schema";
import { calculateLineAmount } from "@/lib/gst";
import { getIndianFinancialYearBounds } from "@/lib/financial-year";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const poItemSchema = z.object({
  productId: z.number().optional().nullable(),
  customName: z.string().optional(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  hsnCode: z.string().optional().nullable(),
});

const createPurchaseOrderSchema = z.object({
  customerId: z.number().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
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

  let customerId = data.customerId ?? null;
  let customerName = data.customerName?.trim() || null;
  let customerPhone = data.customerPhone?.trim() || null;

  if (customerId) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw new Error("Selected customer was not found.");
    customerName = customer.name;
    customerPhone = customer.phone ?? customerPhone;
  }

  if (!customerId && !customerName) {
    throw new Error("Select a customer or enter a customer name.");
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
        customerId,
        customerName,
        customerPhone,
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
      customerId: purchaseOrders.customerId,
      customerName: purchaseOrders.customerName,
      customerPhone: purchaseOrders.customerPhone,
      customerRecordName: customers.name,
      subtotal: purchaseOrders.subtotal,
      grandTotal: purchaseOrders.grandTotal,
      status: purchaseOrders.status,
      notes: purchaseOrders.notes,
    })
    .from(purchaseOrders)
    .leftJoin(customers, eq(purchaseOrders.customerId, customers.id))
    .orderBy(desc(purchaseOrders.date))
    .limit(500);
}

export async function getPurchaseOrderById(id: number) {
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      date: purchaseOrders.date,
      customerId: purchaseOrders.customerId,
      customerName: purchaseOrders.customerName,
      customerPhone: purchaseOrders.customerPhone,
      notes: purchaseOrders.notes,
      subtotal: purchaseOrders.subtotal,
      grandTotal: purchaseOrders.grandTotal,
      status: purchaseOrders.status,
      createdAt: purchaseOrders.createdAt,
      customerRecordName: customers.name,
      customerRecordPhone: customers.phone,
      customerGstin: customers.gstin,
      customerAddress: customers.address,
    })
    .from(purchaseOrders)
    .leftJoin(customers, eq(purchaseOrders.customerId, customers.id))
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
      amount: purchaseOrderItems.amount,
      unit: products.unit,
    })
    .from(purchaseOrderItems)
    .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, id));

  return { ...po, items };
}
