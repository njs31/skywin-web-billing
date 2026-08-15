import { db } from "@/db";
import {
  partyPayments,
  partyPaymentAllocations,
  customers,
  suppliers,
  purchases,
  sales,
} from "@/db/schema";
import { desc, eq, sql, asc, and, isNotNull } from "drizzle-orm";
import { z } from "zod";

const allocationSchema = z.object({
  saleId: z.number().optional(),
  purchaseId: z.number().optional(),
  amount: z.number().positive(),
});

const paymentSchema = z.object({
  type: z.enum(["receipt", "payment"]),
  customerId: z.number().optional(),
  supplierId: z.number().optional(),
  amount: z.number().positive(),
  paymentMode: z.enum(["cash", "upi", "credit", "card", "cheque"]),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(allocationSchema).optional(),
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function createPartyPayment(input: z.infer<typeof paymentSchema>) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const data = paymentSchema.parse(input);

  if (data.type === "receipt" && !data.customerId) {
    throw new Error("Customer required for receipt");
  }
  if (data.type === "payment" && !data.supplierId) {
    throw new Error("Supplier required for payment");
  }

  const allocations = data.allocations ?? [];
  const allocatedTotal = round2(
    allocations.reduce((sum, row) => sum + row.amount, 0)
  );

  if (allocations.length > 0 && Math.abs(allocatedTotal - data.amount) > 0.01) {
    throw new Error("Allocation total must equal the receipt/payment amount.");
  }

  if (data.type === "receipt") {
    for (const row of allocations) {
      if (!row.saleId) throw new Error("Each receipt allocation needs an invoice.");
    }
  } else {
    for (const row of allocations) {
      if (!row.purchaseId) {
        throw new Error("Each payment allocation needs a purchase bill.");
      }
    }
  }

  const payment = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(partyPayments)
      .values({
        type: data.type,
        customerId: data.customerId,
        supplierId: data.supplierId,
        amount: data.amount.toFixed(2),
        paymentMode: data.paymentMode,
        referenceNo: data.referenceNo,
        notes: data.notes,
      })
      .returning();

    for (const row of allocations) {
      // Reject over-allocation: silently capping paid_amount while recording a
      // larger allocation amount would corrupt outstanding balances.
      if (row.saleId) {
        const [sale] = await tx
          .select({
            invoiceNo: sales.invoiceNo,
            grandTotal: sales.grandTotal,
            paidAmount: sales.paidAmount,
            customerId: sales.customerId,
          })
          .from(sales)
          .where(eq(sales.id, row.saleId))
          .limit(1);
        if (!sale) throw new Error(`Invoice #${row.saleId} not found.`);
        if (data.customerId && sale.customerId !== data.customerId) {
          throw new Error(
            `Invoice ${sale.invoiceNo} does not belong to this customer.`
          );
        }
        const balance = round2(
          parseFloat(sale.grandTotal) - parseFloat(sale.paidAmount ?? "0")
        );
        if (row.amount - balance > 0.01) {
          throw new Error(
            `Allocation ₹${row.amount.toFixed(2)} exceeds balance ₹${balance.toFixed(2)} on ${sale.invoiceNo}.`
          );
        }
      }

      if (row.purchaseId) {
        const [purchase] = await tx
          .select({
            invoiceNo: purchases.invoiceNo,
            grandTotal: purchases.grandTotal,
            paidAmount: purchases.paidAmount,
            supplierId: purchases.supplierId,
          })
          .from(purchases)
          .where(eq(purchases.id, row.purchaseId))
          .limit(1);
        if (!purchase) throw new Error(`Purchase #${row.purchaseId} not found.`);
        if (data.supplierId && purchase.supplierId !== data.supplierId) {
          throw new Error(
            `Purchase ${purchase.invoiceNo ?? `#${row.purchaseId}`} does not belong to this supplier.`
          );
        }
        const balance = round2(
          parseFloat(purchase.grandTotal) -
            parseFloat(purchase.paidAmount ?? "0")
        );
        if (row.amount - balance > 0.01) {
          throw new Error(
            `Allocation ₹${row.amount.toFixed(2)} exceeds balance ₹${balance.toFixed(2)} on ${purchase.invoiceNo ?? `purchase #${row.purchaseId}`}.`
          );
        }
      }

      await tx.insert(partyPaymentAllocations).values({
        paymentId: created.id,
        saleId: row.saleId ?? null,
        purchaseId: row.purchaseId ?? null,
        amount: row.amount.toFixed(2),
      });

      if (row.saleId) {
        await tx
          .update(sales)
          .set({
            paidAmount: sql`least(
              ${sales.grandTotal}::numeric,
              coalesce(${sales.paidAmount}::numeric, 0) + ${row.amount}
            )`,
          })
          .where(eq(sales.id, row.saleId));
      }

      if (row.purchaseId) {
        await tx
          .update(purchases)
          .set({
            paidAmount: sql`least(
              ${purchases.grandTotal}::numeric,
              coalesce(${purchases.paidAmount}::numeric, 0) + ${row.amount}
            )`,
          })
          .where(eq(purchases.id, row.purchaseId));
      }
    }

    return created;
  });

  revalidateTag("customers", "max");
  revalidateTag("suppliers", "max");
  revalidateTag("purchases", "max");
  revalidatePath("/accounts/receipts");
  revalidatePath("/accounts/payments");
  revalidatePath("/accounts/outstanding");
  revalidatePath("/invoices");
  revalidatePath("/purchases");

  return payment;
}

export async function getOutstandingSalesForCustomer(customerId: number) {
  return db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      grandTotal: sales.grandTotal,
      paidAmount: sales.paidAmount,
      balance: sql<string>`(${sales.grandTotal}::numeric - coalesce(${sales.paidAmount}::numeric, 0))`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.customerId, customerId),
        sql`(${sales.grandTotal}::numeric - coalesce(${sales.paidAmount}::numeric, 0)) > 0`
      )
    )
    .orderBy(asc(sales.date));
}

export async function getOutstandingPurchasesForSupplier(supplierId: number) {
  return db
    .select({
      id: purchases.id,
      invoiceNo: purchases.invoiceNo,
      date: purchases.date,
      grandTotal: purchases.grandTotal,
      paidAmount: purchases.paidAmount,
      balance: sql<string>`(${purchases.grandTotal}::numeric - coalesce(${purchases.paidAmount}::numeric, 0))`,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.supplierId, supplierId),
        sql`(${purchases.grandTotal}::numeric - coalesce(${purchases.paidAmount}::numeric, 0)) > 0`
      )
    )
    .orderBy(asc(purchases.date));
}

export async function getReceipts() {
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const customerIds = await getScopedCustomerIds();

  const query = db
    .select({
      id: partyPayments.id,
      date: partyPayments.date,
      amount: partyPayments.amount,
      paymentMode: partyPayments.paymentMode,
      referenceNo: partyPayments.referenceNo,
      notes: partyPayments.notes,
      customerName: customers.name,
      allocatedInvoices: sql<string>`coalesce((
        select string_agg(s.invoice_no, ', ' order by s.invoice_no)
        from party_payment_allocations a
        join sales s on s.id = a.sale_id
        where a.payment_id = ${partyPayments.id}
      ), '')`,
    })
    .from(partyPayments)
    .innerJoin(customers, eq(partyPayments.customerId, customers.id));

  const baseCondition = eq(partyPayments.type, "receipt");

  if (customerIds !== null) {
    if (customerIds.length === 0) return [];
    return query
      .where(and(baseCondition, inArray(partyPayments.customerId, customerIds)))
      .orderBy(desc(partyPayments.date))
      .limit(100);
  }

  return query
    .where(baseCondition)
    .orderBy(desc(partyPayments.date))
    .limit(100);
}

export async function getPartyPaymentById(id: number) {
  const [payment] = await db
    .select({
      id: partyPayments.id,
      type: partyPayments.type,
      date: partyPayments.date,
      amount: partyPayments.amount,
      paymentMode: partyPayments.paymentMode,
      referenceNo: partyPayments.referenceNo,
      notes: partyPayments.notes,
      customerId: partyPayments.customerId,
      supplierId: partyPayments.supplierId,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerGstin: customers.gstin,
      customerAddress: customers.address,
      supplierName: suppliers.name,
      supplierPhone: suppliers.phone,
      supplierGstin: suppliers.gstin,
      supplierAddress: suppliers.address,
    })
    .from(partyPayments)
    .leftJoin(customers, eq(partyPayments.customerId, customers.id))
    .leftJoin(suppliers, eq(partyPayments.supplierId, suppliers.id))
    .where(eq(partyPayments.id, id))
    .limit(1);

  if (!payment) return null;

  const allocations = await db
    .select({
      id: partyPaymentAllocations.id,
      amount: partyPaymentAllocations.amount,
      saleId: partyPaymentAllocations.saleId,
      purchaseId: partyPaymentAllocations.purchaseId,
      saleInvoiceNo: sales.invoiceNo,
      purchaseInvoiceNo: purchases.invoiceNo,
      billDate: sql<Date | null>`coalesce(${sales.date}, ${purchases.date})`,
    })
    .from(partyPaymentAllocations)
    .leftJoin(sales, eq(partyPaymentAllocations.saleId, sales.id))
    .leftJoin(purchases, eq(partyPaymentAllocations.purchaseId, purchases.id))
    .where(eq(partyPaymentAllocations.paymentId, id));

  return { ...payment, allocations };
}

export async function getSupplierPayments() {
  return db
    .select({
      id: partyPayments.id,
      date: partyPayments.date,
      amount: partyPayments.amount,
      paymentMode: partyPayments.paymentMode,
      referenceNo: partyPayments.referenceNo,
      notes: partyPayments.notes,
      supplierName: suppliers.name,
      allocatedInvoices: sql<string>`coalesce((
        select string_agg(coalesce(p.invoice_no, '#' || p.id::text), ', ' order by p.id)
        from party_payment_allocations a
        join purchases p on p.id = a.purchase_id
        where a.payment_id = ${partyPayments.id}
      ), '')`,
    })
    .from(partyPayments)
    .innerJoin(suppliers, eq(partyPayments.supplierId, suppliers.id))
    .where(eq(partyPayments.type, "payment"))
    .orderBy(desc(partyPayments.date))
    .limit(100);
}

export async function getSupplierOutstanding(supplierId: number) {
  const [purchaseTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${purchases.grandTotal}::numeric - coalesce(${purchases.paidAmount}::numeric, 0)), 0)`,
    })
    .from(purchases)
    .where(eq(purchases.supplierId, supplierId));

  const unallocRows = (await db.execute(sql`
    select coalesce(sum(pp.amount::numeric - coalesce(a.allocated, 0)), 0) as total
    from party_payments pp
    left join (
      select payment_id, sum(amount::numeric) as allocated
      from party_payment_allocations
      group by payment_id
    ) a on a.payment_id = pp.id
    where pp.supplier_id = ${supplierId} and pp.type = 'payment'
  `)) as unknown as Array<{ total: string }>;

  return (
    Math.round(
      (parseFloat(purchaseTotal?.total ?? "0") -
        parseFloat(String(unallocRows[0]?.total ?? "0"))) *
        100
    ) / 100
  );
}

export const getSuppliersWithOutstanding = async () => {
  const allSuppliers = await db.select().from(suppliers).orderBy(asc(suppliers.name));

  const purchaseSums = await db
    .select({
      supplierId: purchases.supplierId,
      total: sql<string>`sum(${purchases.grandTotal}::numeric - coalesce(${purchases.paidAmount}::numeric, 0))`,
    })
    .from(purchases)
    .where(isNotNull(purchases.supplierId))
    .groupBy(purchases.supplierId);

  const unallocatedSums = await db.execute(sql`
    select
      pp.supplier_id as supplier_id,
      sum(pp.amount::numeric - coalesce(a.allocated, 0)) as total
    from party_payments pp
    left join (
      select payment_id, sum(amount::numeric) as allocated
      from party_payment_allocations
      group by payment_id
    ) a on a.payment_id = pp.id
    where pp.supplier_id is not null and pp.type = 'payment'
    group by pp.supplier_id
  `) as unknown as Array<{ supplier_id: number; total: string }>;

  const purchaseMap = new Map(
    purchaseSums.map((p) => [p.supplierId, parseFloat(p.total)])
  );
  const unallocMap = new Map(
    unallocatedSums.map((p) => [p.supplier_id, parseFloat(String(p.total))])
  );

  const result = [];
  for (const s of allSuppliers) {
    const pVal = purchaseMap.get(s.id) ?? 0;
    const payVal = unallocMap.get(s.id) ?? 0;
    const outstanding = Math.round((pVal - payVal) * 100) / 100;
    if (outstanding > 0) result.push({ ...s, outstanding });
  }
  return result.sort((a, b) => b.outstanding - a.outstanding);
};

export async function getOutstandingSummary() {
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const customerIds = await getScopedCustomerIds();

  const salesQuery = db
    .select({
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric - coalesce(${sales.paidAmount}::numeric, 0)), 0)`,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id));

  let salesTotal;
  if (customerIds !== null) {
    if (customerIds.length === 0) {
      salesTotal = [{ total: "0" }];
    } else {
      salesTotal = await salesQuery.where(inArray(sales.customerId, customerIds));
    }
  } else {
    salesTotal = await salesQuery;
  }

  // Unallocated receipts only (allocated ones already reduced paid_amount).
  let unallocReceipts = 0;
  if (customerIds === null || customerIds.length > 0) {
    const rows = (await db.execute(sql`
      select coalesce(sum(pp.amount::numeric - coalesce(a.allocated, 0)), 0) as total
      from party_payments pp
      left join (
        select payment_id, sum(amount::numeric) as allocated
        from party_payment_allocations
        group by payment_id
      ) a on a.payment_id = pp.id
      where pp.type = 'receipt'
        and pp.customer_id is not null
        ${
          customerIds !== null
            ? sql`and pp.customer_id in (${sql.join(
                customerIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            : sql``
        }
    `)) as unknown as Array<{ total: string }>;
    unallocReceipts = parseFloat(String(rows[0]?.total ?? "0"));
  }

  const receivables =
    parseFloat(salesTotal[0]?.total ?? "0") - unallocReceipts;

  const [purchaseTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${purchases.grandTotal}::numeric - coalesce(${purchases.paidAmount}::numeric, 0)), 0)`,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id));

  const unallocPayRows = (await db.execute(sql`
    select coalesce(sum(pp.amount::numeric - coalesce(a.allocated, 0)), 0) as total
    from party_payments pp
    left join (
      select payment_id, sum(amount::numeric) as allocated
      from party_payment_allocations
      group by payment_id
    ) a on a.payment_id = pp.id
    where pp.type = 'payment' and pp.supplier_id is not null
  `)) as unknown as Array<{ total: string }>;

  const payables =
    parseFloat(purchaseTotal?.total ?? "0") -
    parseFloat(String(unallocPayRows[0]?.total ?? "0"));

  return {
    receivables: Math.round(receivables * 100) / 100,
    payables: Math.round(payables * 100) / 100,
  };
}
