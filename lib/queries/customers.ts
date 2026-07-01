import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { customers, sales, partyPayments, saleReturns } from "@/db/schema";
import { asc, eq, ilike, or, sql, desc, and, isNotNull } from "drizzle-orm";
import { z } from "zod";

export async function getCustomers(search?: string) {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  const query = db.select().from(customers);

  let conditions: any[] = [];
  if (search?.trim()) {
    conditions.push(
      or(
        ilike(customers.name, `%${search}%`),
        ilike(customers.phone, `%${search}%`)
      )
    );
  }

  if (customerIds !== null) {
    if (customerIds.length === 0) return [];
    conditions.push(inArray(customers.id, customerIds));
  }

  if (conditions.length > 0) {
    return query.where(and(...conditions)).orderBy(asc(customers.name)).limit(50);
  }

  return query.orderBy(asc(customers.name));
}

export async function getCustomerById(id: number) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return customer ?? null;
}

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  gstin: z.string().optional(),
  address: z.string().optional(),
  type: z.enum(["retail", "wholesale", "farmer"]).default("retail"),
  creditLimit: z.number().min(0).optional(),
});

export async function createCustomer(input: z.infer<typeof customerSchema>) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const data = customerSchema.parse(input);

  if (data.gstin && data.gstin.trim()) {
    const cleanGst = data.gstin.trim();
    const existing = await db
      .select()
      .from(customers)
      .where(eq(customers.gstin, cleanGst))
      .limit(1);
    if (existing.length > 0) {
      throw new Error(`GSTIN number "${cleanGst}" is already registered to customer "${existing[0].name}". Only one company is allowed per GST number.`);
    }
  }

  const [customer] = await db
    .insert(customers)
    .values({
      name: data.name,
      phone: data.phone,
      gstin: data.gstin,
      address: data.address,
      type: data.type,
      creditLimit: (data.creditLimit ?? 0).toFixed(2),
    })
    .returning();
  revalidateTag("customers", "max");
  revalidatePath("/customers");
  return customer;
}

export async function updateCustomer(
  id: number,
  input: z.infer<typeof customerSchema>
) {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const { ne } = await import("drizzle-orm");
  const data = customerSchema.parse(input);

  if (data.gstin && data.gstin.trim()) {
    const cleanGst = data.gstin.trim();
    const existing = await db
      .select()
      .from(customers)
      .where(and(eq(customers.gstin, cleanGst), ne(customers.id, id)))
      .limit(1);
    if (existing.length > 0) {
      throw new Error(`GSTIN number "${cleanGst}" is already registered to customer "${existing[0].name}". Only one company is allowed per GST number.`);
    }
  }

  const [customer] = await db
    .update(customers)
    .set({
      name: data.name,
      phone: data.phone,
      gstin: data.gstin,
      address: data.address,
      type: data.type,
      creditLimit: (data.creditLimit ?? 0).toFixed(2),
    })
    .where(eq(customers.id, id))
    .returning();
  revalidateTag("customers", "max");
  revalidatePath("/customers");
  return customer;
}

export async function getCustomerOutstanding(customerId: number) {
  const [salesTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric - coalesce(${sales.paidAmount}::numeric, 0)), 0)`,
    })
    .from(sales)
    .where(eq(sales.customerId, customerId));

  const [returnsTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${saleReturns.grandTotal}::numeric), 0)`,
    })
    .from(saleReturns)
    .where(eq(saleReturns.customerId, customerId));

  const [paymentsTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${partyPayments.amount}::numeric), 0)`,
    })
    .from(partyPayments)
    .where(eq(partyPayments.customerId, customerId));

  const outstanding =
    parseFloat(salesTotal?.total ?? "0") -
    parseFloat(returnsTotal?.total ?? "0") -
    parseFloat(paymentsTotal?.total ?? "0");

  return Math.round(outstanding * 100) / 100;
}

export async function getCustomersWithOutstanding() {
  const { getCurrentUser, getVisibleCustomerIds } = await import("@/lib/actions/auth");
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  let allCustomers = await db.select().from(customers).orderBy(asc(customers.name));
  if (customerIds !== null) {
    allCustomers = allCustomers.filter((c) => customerIds!.includes(c.id));
  }

  const salesSums = await db
    .select({
      customerId: sales.customerId,
      total: sql<string>`sum(${sales.grandTotal}::numeric - coalesce(${sales.paidAmount}::numeric, 0))`
    })
    .from(sales)
    .where(isNotNull(sales.customerId))
    .groupBy(sales.customerId);

  const returnsSums = await db
    .select({
      customerId: saleReturns.customerId,
      total: sql<string>`sum(${saleReturns.grandTotal}::numeric)`
    })
    .from(saleReturns)
    .where(isNotNull(saleReturns.customerId))
    .groupBy(saleReturns.customerId);

  const paymentsSums = await db
    .select({
      customerId: partyPayments.customerId,
      total: sql<string>`sum(${partyPayments.amount}::numeric)`
    })
    .from(partyPayments)
    .where(and(isNotNull(partyPayments.customerId), eq(partyPayments.type, "receipt")))
    .groupBy(partyPayments.customerId);

  const salesMap = new Map(salesSums.map(s => [s.customerId, parseFloat(s.total)]));
  const returnsMap = new Map(returnsSums.map(r => [r.customerId, parseFloat(r.total)]));
  const paymentsMap = new Map(paymentsSums.map(p => [p.customerId, parseFloat(p.total)]));

  const result = [];
  for (const c of allCustomers) {
    const sVal = salesMap.get(c.id) ?? 0;
    const rVal = returnsMap.get(c.id) ?? 0;
    const pVal = paymentsMap.get(c.id) ?? 0;
    const outstanding = Math.round((sVal - rVal - pVal) * 100) / 100;
    if (outstanding > 0) {
      result.push({ ...c, outstanding });
    }
  }
  return result.sort((a, b) => b.outstanding - a.outstanding);
}

export async function getCustomerSales(customerId: number) {
  return db
    .select()
    .from(sales)
    .where(eq(sales.customerId, customerId))
    .orderBy(desc(sales.date))
    .limit(50);
}
