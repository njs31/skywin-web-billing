import { db } from "@/db";
import {
  quotations,
  quotationItems,
  products,
  customers,
} from "@/db/schema";
import {
  applyRupeeRounding,
  calculateGstBreakdown,
  calculateLineAmount,
} from "@/lib/gst";
import { getIndianFinancialYearBounds } from "@/lib/financial-year";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const quotationItemSchema = z.object({
  productId: z.number().optional().nullable(),
  customName: z.string().optional(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.number().nonnegative().default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  hsnCode: z.string().optional().nullable(),
});

const createQuotationSchema = z.object({
  customerId: z.number().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  paymentTerms: z.string().optional(),
  dispatchedThrough: z.string().optional(),
  destination: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(quotationItemSchema).min(1),
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function generateQuotationNo(tx: DbOrTx) {
  const { start: fyStart, end: fyEnd } = getIndianFinancialYearBounds();
  const fyStartIso = fyStart.toISOString();
  const fyEndIso = fyEnd.toISOString();

  const rows = (await tx.execute(sql`
    select coalesce(max(nullif(substring(quotation_no from '([0-9]+)$'), '')::int), 0) + 1 as next_seq
    from quotations
    where quotation_no ~ '^QT[0-9]+$'
      and date >= ${fyStartIso}::timestamptz
      and date <= ${fyEndIso}::timestamptz
  `)) as unknown as Array<{ next_seq: number | string }>;

  const seq = Number(rows[0]?.next_seq ?? 1);
  return `QT${String(seq).padStart(6, "0")}`;
}

export async function createQuotation(
  input: z.infer<typeof createQuotationSchema>
) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } =
    await import("@/lib/revalidate");
  const data = createQuotationSchema.parse(input);

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

  const gst = applyRupeeRounding(
    calculateGstBreakdown(
      data.items.map((item) => ({
        qty: item.qty,
        rate: item.rate,
        gstRate: item.gstRate,
        discountType: "percent" as const,
        discountValue: item.discountPercent,
      }))
    )
  );

  const created = await db.transaction(async (tx) => {
    const quotationNo = await generateQuotationNo(tx);

    const [quote] = await tx
      .insert(quotations)
      .values({
        quotationNo,
        customerId,
        customerName,
        customerPhone,
        paymentTerms: data.paymentTerms?.trim() || null,
        dispatchedThrough: data.dispatchedThrough?.trim() || null,
        destination: data.destination?.trim() || null,
        notes: data.notes?.trim() || null,
        subtotal: gst.subtotal.toFixed(2),
        cgst: gst.cgst.toFixed(2),
        sgst: gst.sgst.toFixed(2),
        igst: gst.igst.toFixed(2),
        roundOff: (gst.roundOff ?? 0).toFixed(2),
        grandTotal: gst.grandTotal.toFixed(2),
        status: "open",
      })
      .returning();

    await tx.insert(quotationItems).values(
      data.items.map((item) => ({
        quotationId: quote.id,
        productId: item.productId ?? null,
        customName: item.customName?.trim() || null,
        qty: item.qty.toFixed(2),
        rate: item.rate.toFixed(2),
        gstRate: item.gstRate.toFixed(2),
        discountPercent: item.discountPercent.toFixed(2),
        amount: calculateLineAmount(
          item.qty,
          item.rate,
          item.discountPercent,
          "percent"
        ).toFixed(2),
        hsnCode: item.hsnCode?.trim() || null,
      }))
    );

    return quote;
  });

  revalidateTag("quotations", "max");
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${created.id}`);

  return created;
}

export async function getQuotations() {
  return db
    .select({
      id: quotations.id,
      quotationNo: quotations.quotationNo,
      date: quotations.date,
      customerId: quotations.customerId,
      customerName: quotations.customerName,
      customerPhone: quotations.customerPhone,
      customerRecordName: customers.name,
      subtotal: quotations.subtotal,
      grandTotal: quotations.grandTotal,
      status: quotations.status,
      notes: quotations.notes,
    })
    .from(quotations)
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .orderBy(desc(quotations.date))
    .limit(500);
}

export async function getQuotationById(id: number) {
  const [quote] = await db
    .select({
      id: quotations.id,
      quotationNo: quotations.quotationNo,
      date: quotations.date,
      customerId: quotations.customerId,
      customerName: quotations.customerName,
      customerPhone: quotations.customerPhone,
      paymentTerms: quotations.paymentTerms,
      dispatchedThrough: quotations.dispatchedThrough,
      destination: quotations.destination,
      notes: quotations.notes,
      subtotal: quotations.subtotal,
      cgst: quotations.cgst,
      sgst: quotations.sgst,
      igst: quotations.igst,
      roundOff: quotations.roundOff,
      grandTotal: quotations.grandTotal,
      status: quotations.status,
      createdAt: quotations.createdAt,
      customerRecordName: customers.name,
      customerRecordPhone: customers.phone,
      customerGstin: customers.gstin,
      customerAddress: customers.address,
    })
    .from(quotations)
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .where(eq(quotations.id, id))
    .limit(1);

  if (!quote) return null;

  const items = await db
    .select({
      id: quotationItems.id,
      productId: quotationItems.productId,
      productName: products.name,
      customName: quotationItems.customName,
      hsnCode: sql<string>`coalesce(${quotationItems.hsnCode}, ${products.hsnCode})`,
      qty: quotationItems.qty,
      rate: quotationItems.rate,
      gstRate: quotationItems.gstRate,
      discountPercent: quotationItems.discountPercent,
      amount: quotationItems.amount,
      unit: products.unit,
    })
    .from(quotationItems)
    .leftJoin(products, eq(quotationItems.productId, products.id))
    .where(eq(quotationItems.quotationId, id));

  return { ...quote, items };
}
