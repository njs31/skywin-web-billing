import { db } from "@/db";
import {
  partyPayments,
  customers,
  suppliers,
  purchases,
  sales,
} from "@/db/schema";
import { desc, eq, sql, asc } from "drizzle-orm";
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
  return db
    .select({
      id: partyPayments.id,
      date: partyPayments.date,
      amount: partyPayments.amount,
      paymentMode: partyPayments.paymentMode,
      referenceNo: partyPayments.referenceNo,
      customerName: customers.name,
    })
    .from(partyPayments)
    .innerJoin(customers, eq(partyPayments.customerId, customers.id))
    .where(eq(partyPayments.type, "receipt"))
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
  const result = [];
  for (const s of allSuppliers) {
    const outstanding = await getSupplierOutstanding(s.id);
    if (outstanding > 0) result.push({ ...s, outstanding });
  }
  return result.sort((a, b) => b.outstanding - a.outstanding);
};

export async function getOutstandingSummary() {
  const customerList = await db.select().from(customers);
  const supplierList = await db.select().from(suppliers);

  let receivables = 0;
  for (const c of customerList) {
    const [salesTotal] = await db
      .select({
        total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric - coalesce(${sales.paidAmount}::numeric, 0)), 0)`,
      })
      .from(sales)
      .where(eq(sales.customerId, c.id));
    const [paymentsTotal] = await db
      .select({
        total: sql<string>`coalesce(sum(${partyPayments.amount}::numeric), 0)`,
      })
      .from(partyPayments)
      .where(eq(partyPayments.customerId, c.id));
    receivables +=
      parseFloat(salesTotal?.total ?? "0") -
      parseFloat(paymentsTotal?.total ?? "0");
  }

  let payables = 0;
  for (const s of supplierList) {
    payables += await getSupplierOutstanding(s.id);
  }

  return {
    receivables: Math.round(receivables * 100) / 100,
    payables: Math.round(payables * 100) / 100,
  };
};
