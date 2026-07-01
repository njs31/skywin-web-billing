import { db } from "@/db";
import {
  partyPayments,
  customers,
  suppliers,
  purchases,
  sales,
} from "@/db/schema";
import { desc, eq, sql, asc, and, isNotNull } from "drizzle-orm";
import { z } from "zod";

const paymentSchema = z.object({
  type: z.enum(["receipt", "payment"]),
  customerId: z.number().optional(),
  supplierId: z.number().optional(),
  amount: z.number().positive(),
  paymentMode: z.enum(["cash", "upi", "credit", "card", "cheque"]),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
});

export async function createPartyPayment(input: z.infer<typeof paymentSchema>) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const data = paymentSchema.parse(input);

  if (data.type === "receipt" && !data.customerId) {
    throw new Error("Customer required for receipt");
  }
  if (data.type === "payment" && !data.supplierId) {
    throw new Error("Supplier required for payment");
  }

  const [payment] = await db
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

  revalidateTag("customers", "max");
  revalidateTag("suppliers", "max");
  revalidatePath("/accounts/receipts");
  revalidatePath("/accounts/payments");
  revalidatePath("/accounts/outstanding");

  return payment;
}

export async function getReceipts() {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const query = db
    .select({
      id: partyPayments.id,
      date: partyPayments.date,
      amount: partyPayments.amount,
      paymentMode: partyPayments.paymentMode,
      referenceNo: partyPayments.referenceNo,
      customerName: customers.name,
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

export async function getSupplierPayments() {
  return db
    .select({
      id: partyPayments.id,
      date: partyPayments.date,
      amount: partyPayments.amount,
      paymentMode: partyPayments.paymentMode,
      referenceNo: partyPayments.referenceNo,
      supplierName: suppliers.name,
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

  const [paymentsTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${partyPayments.amount}::numeric), 0)`,
    })
    .from(partyPayments)
    .where(eq(partyPayments.supplierId, supplierId));

  return (
    Math.round(
      (parseFloat(purchaseTotal?.total ?? "0") -
        parseFloat(paymentsTotal?.total ?? "0")) *
        100
    ) / 100
  );
}

export const getSuppliersWithOutstanding = async () => {
  const allSuppliers = await db.select().from(suppliers).orderBy(asc(suppliers.name));

  const purchaseSums = await db
    .select({
      supplierId: purchases.supplierId,
      total: sql<string>`sum(${purchases.grandTotal}::numeric - coalesce(${purchases.paidAmount}::numeric, 0))`
    })
    .from(purchases)
    .where(isNotNull(purchases.supplierId))
    .groupBy(purchases.supplierId);

  const paymentSums = await db
    .select({
      supplierId: partyPayments.supplierId,
      total: sql<string>`sum(${partyPayments.amount}::numeric)`
    })
    .from(partyPayments)
    .where(and(isNotNull(partyPayments.supplierId), eq(partyPayments.type, "payment")))
    .groupBy(partyPayments.supplierId);

  const purchaseMap = new Map(purchaseSums.map(p => [p.supplierId, parseFloat(p.total)]));
  const paymentMap = new Map(paymentSums.map(p => [p.supplierId, parseFloat(p.total)]));

  const result = [];
  for (const s of allSuppliers) {
    const pVal = purchaseMap.get(s.id) ?? 0;
    const payVal = paymentMap.get(s.id) ?? 0;
    const outstanding = Math.round((pVal - payVal) * 100) / 100;
    if (outstanding > 0) result.push({ ...s, outstanding });
  }
  return result.sort((a, b) => b.outstanding - a.outstanding);
};

export async function getOutstandingSummary() {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const salesQuery = db
    .select({
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric - coalesce(${sales.paidAmount}::numeric, 0)), 0)`,
    })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id));

  const paymentsQuery = db
    .select({
      total: sql<string>`coalesce(sum(${partyPayments.amount}::numeric), 0)`,
    })
    .from(partyPayments)
    .innerJoin(customers, eq(partyPayments.customerId, customers.id));

  const receiptsCondition = eq(partyPayments.type, "receipt");

  let salesTotal, paymentsTotal;

  if (customerIds !== null) {
    if (customerIds.length === 0) {
      salesTotal = [{ total: "0" }];
      paymentsTotal = [{ total: "0" }];
    } else {
      salesTotal = await salesQuery.where(inArray(sales.customerId, customerIds));
      paymentsTotal = await paymentsQuery.where(
        and(receiptsCondition, inArray(partyPayments.customerId, customerIds))
      );
    }
  } else {
    salesTotal = await salesQuery;
    paymentsTotal = await paymentsQuery.where(receiptsCondition);
  }

  const receivables = parseFloat(salesTotal[0]?.total ?? "0") - parseFloat(paymentsTotal[0]?.total ?? "0");

  const [purchaseTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${purchases.grandTotal}::numeric - coalesce(${purchases.paidAmount}::numeric, 0)), 0)`,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id));

  const [supplierPaymentsTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${partyPayments.amount}::numeric), 0)`,
    })
    .from(partyPayments)
    .innerJoin(suppliers, eq(partyPayments.supplierId, suppliers.id))
    .where(eq(partyPayments.type, "payment"));

  const payables = parseFloat(purchaseTotal?.total ?? "0") - parseFloat(supplierPaymentsTotal?.total ?? "0");

  return {
    receivables: Math.round(receivables * 100) / 100,
    payables: Math.round(payables * 100) / 100,
  };
}
