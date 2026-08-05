import { db } from "@/db";
import { customers, sales, saleReturns } from "@/db/schema";
import { asc, eq, ilike, or, sql, desc, and, isNotNull, type SQL } from "drizzle-orm";
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

  const conditions: SQL[] = [];
  if (search?.trim()) {
    const searchCond = or(
      ilike(customers.name, `%${search}%`),
      ilike(customers.phone, `%${search}%`)
    );
    if (searchCond) conditions.push(searchCond);
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
  membershipNo: z.string().optional(),
  type: z.enum(["retail", "wholesale", "farmer"]).default("retail"),
  creditLimit: z.number().min(0).optional(),
});

export async function createCustomer(input: z.infer<typeof customerSchema>) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const data = customerSchema.parse(input);

  const cleanGst = data.gstin?.trim().toUpperCase() || null;
  if (cleanGst) {
    const existing = await db
      .select()
      .from(customers)
      .where(sql`upper(${customers.gstin}) = ${cleanGst}`)
      .limit(1);
    if (existing.length > 0) {
      throw new Error(
        `GSTIN "${cleanGst}" is already registered to "${existing[0].name}". Only one company is allowed per GST number.`
      );
    }
  }

  const [customer] = await db
    .insert(customers)
    .values({
      name: data.name,
      phone: data.phone,
      gstin: cleanGst,
      address: data.address,
      membershipNo: data.membershipNo?.trim() || null,
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
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const { ne } = await import("drizzle-orm");
  const data = customerSchema.parse(input);

  const cleanGst = data.gstin?.trim().toUpperCase() || null;
  if (cleanGst) {
    const existing = await db
      .select()
      .from(customers)
      .where(
        and(
          sql`upper(${customers.gstin}) = ${cleanGst}`,
          ne(customers.id, id)
        )
      )
      .limit(1);
    if (existing.length > 0) {
      throw new Error(
        `GSTIN "${cleanGst}" is already registered to "${existing[0].name}". Only one company is allowed per GST number.`
      );
    }
  }

  const [customer] = await db
    .update(customers)
    .set({
      name: data.name,
      phone: data.phone,
      gstin: cleanGst,
      address: data.address,
      membershipNo: data.membershipNo?.trim() || null,
      type: data.type,
      creditLimit: (data.creditLimit ?? 0).toFixed(2),
    })
    .where(eq(customers.id, id))
    .returning();
  revalidateTag("customers", "max");
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return customer;
}

export async function getCustomerOutstanding(customerId: number) {
  // Unpaid sales minus returns minus unallocated receipts (allocated receipts
  // already increase sales.paid_amount and must not be counted twice).
  const [row] = (await db.execute(sql`
    select
      coalesce((
        select sum(grand_total::numeric - coalesce(paid_amount::numeric, 0))
        from sales where customer_id = ${customerId}
      ), 0) as sales_total,
      coalesce((
        select sum(grand_total::numeric)
        from sale_returns where customer_id = ${customerId}
      ), 0) as returns_total,
      coalesce((
        select sum(pp.amount::numeric - coalesce(a.allocated, 0))
        from party_payments pp
        left join (
          select payment_id, sum(amount::numeric) as allocated
          from party_payment_allocations
          group by payment_id
        ) a on a.payment_id = pp.id
        where pp.customer_id = ${customerId} and pp.type = 'receipt'
      ), 0) as unallocated_receipts
  `)) as unknown as Array<Record<string, unknown>>;

  const outstanding =
    parseFloat(String(row?.sales_total ?? "0")) -
    parseFloat(String(row?.returns_total ?? "0")) -
    parseFloat(String(row?.unallocated_receipts ?? "0"));

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

  const paymentsSums = (await db.execute(sql`
    select
      pp.customer_id as customer_id,
      sum(pp.amount::numeric - coalesce(a.allocated, 0)) as total
    from party_payments pp
    left join (
      select payment_id, sum(amount::numeric) as allocated
      from party_payment_allocations
      group by payment_id
    ) a on a.payment_id = pp.id
    where pp.customer_id is not null and pp.type = 'receipt'
    group by pp.customer_id
  `)) as unknown as Array<{ customer_id: number; total: string }>;

  const salesMap = new Map(salesSums.map(s => [s.customerId, parseFloat(s.total)]));
  const returnsMap = new Map(returnsSums.map(r => [r.customerId, parseFloat(r.total)]));
  const paymentsMap = new Map(
    paymentsSums.map((p) => [p.customer_id, parseFloat(String(p.total))])
  );

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
