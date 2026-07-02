import { unstable_cache } from "next/cache";
import { db } from "@/db";
import {
  sales,
  saleItems,
  products,
  stockMovements,
  customers,
  partyPayments,
  saleReturns,
} from "@/db/schema";
import {
  calculateGstBreakdown,
  calculateLineAmount,
} from "@/lib/gst";
import { getSettings } from "@/lib/settings";
import { format } from "date-fns";
import { desc, eq, gte, sql, and } from "drizzle-orm";
import { z } from "zod";

const saleItemSchema = z.object({
  productId: z.number().optional().nullable(),
  customName: z.string().optional(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountType: z.enum(["percent", "value"]).default("percent"),
  discountValue: z.number().min(0).default(0),
  hsnCode: z.string().optional().nullable(),
});

const createSaleSchema = z.object({
  billType: z.enum(["retail", "wholesale"]).default("retail"),
  customerId: z.number().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  paymentMode: z.enum(["cash", "upi", "credit", "card", "cheque"]),
  operatorName: z.string().optional(),
  discountAmount: z.number().min(0).optional(),
  paidAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
});

async function generateInvoiceNo(billType: "retail" | "wholesale") {
  const settings = await getSettings();
  const today = format(new Date(), "yyyyMMdd");
  const typePrefix = billType === "wholesale" ? "WHL" : settings.invoicePrefix;
  const prefix = `${typePrefix}-${today}-`;

  const [last] = await db
    .select({ invoiceNo: sales.invoiceNo })
    .from(sales)
    .where(sql`${sales.invoiceNo} like ${prefix + "%"}`)
    .orderBy(desc(sales.invoiceNo))
    .limit(1);

  let seq = 1;
  if (last?.invoiceNo) {
    const parts = last.invoiceNo.split("-");
    seq = parseInt(parts[parts.length - 1] ?? "0", 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createSale(input: z.infer<typeof createSaleSchema>) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const data = createSaleSchema.parse(input);
  const settings = await getSettings();
  // Enforce validation: Do not allow sales if product is not in inventory (force allowNegative = false)
  const allowNegative = false;

  if (data.paymentMode === "credit" && (!data.customerId || data.customerId === undefined)) {
    throw new Error("Customer registration required for credit transactions.");
  }

  const productQtyMap = new Map<number, number>();
  for (const item of data.items) {
    if (item.productId) {
      productQtyMap.set(
        item.productId,
        (productQtyMap.get(item.productId) ?? 0) + item.qty
      );
    }
  }

  for (const [productId, totalQty] of productQtyMap) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) throw new Error(`Product ${productId} not found`);

    const stock = parseFloat(product.stockQty);
    if (stock <= 0) {
      throw new Error(`${product.name} is out of stock and cannot be sold.`);
    }
    if (!allowNegative && stock < totalQty) {
      throw new Error(
        `Insufficient stock for ${product.name}. Available: ${stock}, requested: ${totalQty}`
      );
    }
  }

  for (const item of data.items) {
    let effectiveHsn = item.hsnCode;
    if (item.productId) {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (!effectiveHsn && product.hsnCode) effectiveHsn = product.hsnCode;
    }
    if (!effectiveHsn || !effectiveHsn.trim()) {
      throw new Error(`HSN code is mandatory for all items on the invoice (${item.customName || "Product ID: " + item.productId}).`);
    }
  }

  const gst = calculateGstBreakdown(
    data.items.map((i) => ({
      qty: i.qty,
      rate: i.rate,
      gstRate: i.gstRate,
      discountPercent: i.discountPercent ?? 0,
      discountType: i.discountType,
      discountValue: i.discountValue,
    })),
    { billDiscount: data.discountAmount ?? 0 }
  );

  const paidAmount =
    data.paymentMode === "credit"
      ? (data.paidAmount ?? 0)
      : (data.paidAmount ?? gst.grandTotal);

  const invoiceNo = await generateInvoiceNo(data.billType);

  const sale = await db.transaction(async (tx) => {
    let finalCustomerId = data.customerId;
    let finalCustomerName = data.customerName;

    if (!finalCustomerId && (data.customerName?.trim() || data.customerPhone?.trim())) {
      let existingCustomer = null;
      if (data.customerPhone?.trim()) {
        [existingCustomer] = await tx
          .select()
          .from(customers)
          .where(eq(customers.phone, data.customerPhone.trim()))
          .limit(1);
      }

      if (!existingCustomer && data.customerName?.trim()) {
        [existingCustomer] = await tx
          .select()
          .from(customers)
          .where(eq(customers.name, data.customerName.trim()))
          .limit(1);
      }

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
        finalCustomerName = existingCustomer.name;

        if (data.customerPhone?.trim() && !existingCustomer.phone) {
          await tx
            .update(customers)
            .set({ phone: data.customerPhone.trim() })
            .where(eq(customers.id, existingCustomer.id));
        }
      } else {
        const [newCustomer] = await tx
          .insert(customers)
          .values({
            name: data.customerName?.trim() || `Customer-${data.customerPhone?.trim()}`,
            phone: data.customerPhone?.trim() || null,
            type: "retail",
            creditLimit: "0.00",
          })
          .returning();
        finalCustomerId = newCustomer.id;
        finalCustomerName = newCustomer.name;
      }
    }

    if (data.paymentMode === "credit" && finalCustomerId) {
      const [customerRecord] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, finalCustomerId))
        .limit(1);

      if (customerRecord && customerRecord.creditLimit) {
        const limit = parseFloat(customerRecord.creditLimit);
        if (limit > 0) {
          const [salesTotal] = await tx
            .select({ total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric - coalesce(${sales.paidAmount}::numeric, 0)), 0)` })
            .from(sales)
            .where(eq(sales.customerId, finalCustomerId));

          const [returnsTotal] = await tx
            .select({ total: sql<string>`coalesce(sum(${saleReturns.grandTotal}::numeric), 0)` })
            .from(saleReturns)
            .where(eq(saleReturns.customerId, finalCustomerId));

          const [paymentsTotal] = await tx
            .select({ total: sql<string>`coalesce(sum(${partyPayments.amount}::numeric), 0)` })
            .from(partyPayments)
            .where(and(eq(partyPayments.customerId, finalCustomerId), eq(partyPayments.type, "receipt")));

          const currentOutstanding =
            parseFloat(salesTotal?.total ?? "0") -
            parseFloat(returnsTotal?.total ?? "0") -
            parseFloat(paymentsTotal?.total ?? "0");

          if (currentOutstanding + gst.grandTotal > limit) {
            throw new Error(
              `Credit limit exceeded. Outstanding: ₹${currentOutstanding.toFixed(2)}, Limit: ₹${limit.toFixed(2)}, New invoice: ₹${gst.grandTotal.toFixed(2)}`
            );
          }
        }
      }
    }

    const [created] = await tx
      .insert(sales)
      .values({
        invoiceNo,
        billType: data.billType,
        customerId: finalCustomerId,
        customerName: finalCustomerName,
        paymentMode: data.paymentMode,
        operatorName: data.operatorName ?? settings.defaultOperator,
        subtotal: gst.subtotal.toFixed(2),
        discountAmount: gst.discountAmount.toFixed(2),
        cgst: gst.cgst.toFixed(2),
        sgst: gst.sgst.toFixed(2),
        igst: gst.igst.toFixed(2),
        grandTotal: gst.grandTotal.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        notes: data.notes,
      })
      .returning();

    for (const item of data.items) {
      const amount = calculateLineAmount(
        item.qty,
        item.rate,
        item.discountValue,
        item.discountType
      );

      await tx.insert(saleItems).values({
        saleId: created.id,
        productId: item.productId || null,
        customName: item.customName || null,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        discountPercent: item.discountType === "percent" ? item.discountValue.toFixed(2) : "0.00",
        discountType: item.discountType,
        discountValue: item.discountValue.toFixed(2),
        gstRate: item.gstRate.toFixed(2),
        amount: amount.toFixed(2),
        hsnCode: item.hsnCode || null,
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
          type: "sale",
          qtyDelta: (-item.qty).toFixed(2),
          referenceId: created.id,
        });
      }
    }

    return created;
  });

  revalidateTag("sales", "max");
  revalidateTag("products", "max");
  revalidateTag("customers", "max");
  revalidatePath("/invoices");
  revalidatePath("/pos");
  revalidatePath("/products");
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/accounts/outstanding");

  return sale;
}

export async function getSales() {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const query = db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      billType: sales.billType,
      customerName: sales.customerName,
      customerId: sales.customerId,
      paymentMode: sales.paymentMode,
      grandTotal: sales.grandTotal,
      paidAmount: sales.paidAmount,
      operatorName: sales.operatorName,
      customerRecordName: customers.name,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id));

  if (customerIds !== null) {
    if (customerIds.length === 0) return [];
    return query
      .where(inArray(sales.customerId, customerIds))
      .orderBy(desc(sales.date))
      .limit(500);
  }

  return query.orderBy(desc(sales.date)).limit(500);
}

export async function getSaleById(id: number) {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const [sale] = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      billType: sales.billType,
      customerId: sales.customerId,
      customerName: sales.customerName,
      paymentMode: sales.paymentMode,
      operatorName: sales.operatorName,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      cgst: sales.cgst,
      sgst: sales.sgst,
      igst: sales.igst,
      grandTotal: sales.grandTotal,
      paidAmount: sales.paidAmount,
      notes: sales.notes,
      customerRecordName: customers.name,
      customerPhone: customers.phone,
      customerGstin: customers.gstin,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales.id, id))
    .limit(1);

  if (!sale) return null;

  // Check visibility scoping
  if (customerIds !== null) {
    if (!sale.customerId || !customerIds.includes(sale.customerId)) {
      throw new Error("Unauthorized access to this invoice.");
    }
  }

  const items = await db
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      productName: products.name,
      customName: saleItems.customName,
      hsnCode: sql<string>`coalesce(${saleItems.hsnCode}, ${products.hsnCode})`,
      qty: saleItems.qty,
      rate: saleItems.rate,
      discountPercent: saleItems.discountPercent,
      discountType: saleItems.discountType,
      discountValue: saleItems.discountValue,
      gstRate: saleItems.gstRate,
      amount: saleItems.amount,
    })
    .from(saleItems)
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, id));

  return { ...sale, items };
}

export async function getTodaySalesTotal() {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const query = db
    .select({
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
      retail: sql<string>`coalesce(sum(case when ${sales.billType} = 'retail' then ${sales.grandTotal}::numeric else 0 end), 0)`,
      wholesale: sql<string>`coalesce(sum(case when ${sales.billType} = 'wholesale' then ${sales.grandTotal}::numeric else 0 end), 0)`,
    })
    .from(sales);

  const baseCondition = gte(sales.date, startOfDay);

  if (customerIds !== null) {
    if (customerIds.length === 0) {
      return { total: 0, count: 0, retail: 0, wholesale: 0 };
    }
    const [result] = await query.where(and(baseCondition, inArray(sales.customerId, customerIds)));
    return {
      total: parseFloat(result?.total ?? "0"),
      count: result?.count ?? 0,
      retail: parseFloat(result?.retail ?? "0"),
      wholesale: parseFloat(result?.wholesale ?? "0"),
    };
  }

  const [result] = await query.where(baseCondition);
  return {
    total: parseFloat(result?.total ?? "0"),
    count: result?.count ?? 0,
    retail: parseFloat(result?.retail ?? "0"),
    wholesale: parseFloat(result?.wholesale ?? "0"),
  };
}

export async function getRecentSales(limit = 5) {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const query = db.select().from(sales);

  if (customerIds !== null) {
    if (customerIds.length === 0) return [];
    return query
      .where(inArray(sales.customerId, customerIds))
      .orderBy(desc(sales.date))
      .limit(limit);
  }

  return query.orderBy(desc(sales.date)).limit(limit);
}

export async function getTopSellingProducts(limit = 5) {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const query = db
    .select({
      productName: products.name,
      totalQty: sql<string>`sum(${saleItems.qty}::numeric)`,
      totalAmount: sql<string>`sum(${saleItems.amount}::numeric)`,
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .innerJoin(sales, eq(saleItems.saleId, sales.id));

  if (customerIds !== null) {
    if (customerIds.length === 0) return [];
    return query
      .where(inArray(sales.customerId, customerIds))
      .groupBy(products.name)
      .orderBy(desc(sql`sum(${saleItems.amount}::numeric)`))
      .limit(limit);
  }

  return query
    .groupBy(products.name)
    .orderBy(desc(sql`sum(${saleItems.amount}::numeric)`))
    .limit(limit);
}


export async function getProductByBarcode(barcode: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.barcode, barcode))
    .limit(1);
  return product ?? null;
}
