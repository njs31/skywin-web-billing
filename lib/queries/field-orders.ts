import { and, desc, eq, gte, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, productBatches, products, saleItems, sales } from "@/db/schema";
import { activeSale, createSale } from "@/lib/queries/sales";
import { getBatchBillingRate } from "@/lib/gst";
import { toNumber } from "@/lib/utils";

export const FIELD_ORDER_PREFIXES = ["SW-", "FO-"] as const;

export function isFieldExternalId(id: string) {
  const v = id.trim().toUpperCase();
  return FIELD_ORDER_PREFIXES.some((p) => v.startsWith(p));
}

export function fieldSaleWhere() {
  return or(
    like(sales.externalOrderId, "SW-%"),
    like(sales.externalOrderId, "FO-%"),
    like(sales.operatorName, "Field · %")
  );
}

function digitsPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

async function findOrCreateFarmerCustomer(name: string, phone: string) {
  const trimmedName = name.trim() || (phone ? `Farmer-${phone}` : "Field farmer");
  if (phone) {
    const [existing] = await db
      .select()
      .from(customers)
      .where(sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') = ${phone}`)
      .limit(1);
    if (existing) {
      if (existing.type !== "farmer") {
        await db
          .update(customers)
          .set({ type: "farmer" })
          .where(eq(customers.id, existing.id));
      }
      return existing;
    }
  }
  const [created] = await db
    .insert(customers)
    .values({
      name: trimmedName,
      phone: phone || null,
      type: "farmer",
      creditLimit: "0.00",
    })
    .returning();
  return created;
}

export type FieldOrderLineIn = {
  productId: number;
  batchId?: number | null;
  qty: number;
  rate?: number;
  gstRate?: number;
};

export type FieldOrderIn = {
  orderId: string;
  farmerName: string;
  farmerPhone: string;
  officerName: string;
  deliveryDate?: string;
  note?: string;
  placedGps?: string;
  paidAmount: number;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  items: FieldOrderLineIn[];
};

function fieldDeductsStock() {
  return process.env.FIELD_DEDUCT_STOCK === "true";
}

export async function placeFieldOrder(input: FieldOrderIn) {
  const orderId = input.orderId.trim();
  if (!orderId) throw new Error("orderId is required");
  if (!input.items.length) throw new Error("No items provided");

  const [already] = await db
    .select({ id: sales.id, invoiceNo: sales.invoiceNo })
    .from(sales)
    .where(eq(sales.externalOrderId, orderId))
    .limit(1);
  if (already) {
    return {
      success: true as const,
      duplicate: true,
      orderId,
      saleId: already.id,
      invoiceNo: already.invoiceNo,
    };
  }

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const catalog = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));
  const byId = new Map(catalog.map((p) => [p.id, p]));

  const phone = digitsPhone(input.farmerPhone);
  const farmer = await findOrCreateFarmerCustomer(
    input.farmerName,
    phone
  );
  const notes = [
    `Field order ${orderId}`,
    input.officerName ? `Officer ${input.officerName}` : null,
    input.deliveryDate ? `Deliver ${input.deliveryDate}` : null,
    input.placedGps ? `GPS ${input.placedGps}` : null,
    input.razorpayPaymentId ? `Razorpay ${input.razorpayPaymentId}` : null,
    input.note || null,
    fieldDeductsStock() ? null : "Test order · inventory not deducted",
  ]
    .filter(Boolean)
    .join(" · ");

  const sale = await createSale({
    billType: "retail",
    customerId: farmer.id,
    customerName: farmer.name,
    customerPhone: farmer.phone || phone || undefined,
    paymentMode: "upi",
    operatorName: `Field · ${input.officerName.trim() || "Officer"}`,
    notes,
    deliveryNote: input.deliveryDate || undefined,
    destination: input.placedGps || undefined,
    externalOrderId: orderId,
    items: input.items.map((item) => {
      const p = byId.get(item.productId);
      if (!p) throw new Error(`Product ${item.productId} not found`);
      const rate =
        item.rate && item.rate > 0
          ? item.rate
          : getBatchBillingRate(
              { saleRate: p.saleRate, batchSaleRate: null },
              "retail"
            );
      return {
        productId: item.productId,
        qty: item.qty,
        rate,
        gstRate: item.gstRate ?? toNumber(p.gstRate),
        discountType: "percent" as const,
        discountValue: 0,
        batchId: item.batchId ?? null,
      };
    }),
  });

  return {
    success: true as const,
    duplicate: false,
    orderId,
    saleId: sale.id,
    invoiceNo: sale.invoiceNo,
  };
}

export async function listFieldOrders() {
  const rows = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      externalOrderId: sales.externalOrderId,
      operatorName: sales.operatorName,
      customerName: sales.customerName,
      customerPhone: customers.phone,
      paymentMode: sales.paymentMode,
      grandTotal: sales.grandTotal,
      upiAmount: sales.upiAmount,
      status: sales.status,
      notes: sales.notes,
      deliveryNote: sales.deliveryNote,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(activeSale, fieldSaleWhere()))
    .orderBy(desc(sales.date))
    .limit(200);

  const ids = rows.map((r) => r.id);
  const items =
    ids.length === 0
      ? []
      : await db
          .select({
            saleId: saleItems.saleId,
            name: products.name,
            customName: saleItems.customName,
            productId: saleItems.productId,
            qty: saleItems.qty,
            batchNumber: saleItems.batchNumber,
            expiry: productBatches.expiryDate,
            amount: saleItems.amount,
          })
          .from(saleItems)
          .leftJoin(products, eq(products.id, saleItems.productId))
          .leftJoin(productBatches, eq(productBatches.id, saleItems.batchId))
          .where(inArray(saleItems.saleId, ids));

  const bySale = new Map<number, typeof items>();
  for (const it of items) {
    const list = bySale.get(it.saleId) ?? [];
    list.push(it);
    bySale.set(it.saleId, list);
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  const [todayAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
    })
    .from(sales)
    .where(and(activeSale, fieldSaleWhere(), gte(sales.date, startOfToday)));

  const [monthAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
    })
    .from(sales)
    .where(and(activeSale, fieldSaleWhere(), gte(sales.date, startOfMonth)));

  return {
    todayCount: Number(todayAgg?.count ?? 0),
    todayTotal: toNumber(todayAgg?.total ?? 0),
    monthCount: Number(monthAgg?.count ?? 0),
    monthTotal: toNumber(monthAgg?.total ?? 0),
    orders: rows.map((r) => ({
      ...r,
      lines: (bySale.get(r.id) ?? []).map((it) => ({
        name: it.customName || it.name || "Item",
        productId: it.productId,
        qty: toNumber(it.qty),
        batchNumber: it.batchNumber,
        expiry: it.expiry,
        amount: toNumber(it.amount),
      })),
    })),
  };
}
