import { db } from "@/db";
import {
  sales,
  saleItems,
  products,
  customers,
} from "@/db/schema";
import {
  calculateGstBreakdown,
  calculateLineAmount,
  isInterstateGst,
} from "@/lib/gst";
import { getSettings } from "@/lib/settings";
import { format } from "date-fns";
import { desc, eq, gte, lte, sql, and, inArray } from "drizzle-orm";
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
  batchId: z.number().optional().nullable(),
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
  cashAmount: z.number().min(0).optional(),
  upiAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function toDateString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  return String(value);
}

/** Map a raw (snake_case) sales row from a CTE insert back to the drizzle shape. */
function mapSaleRow(row: Record<string, unknown>): typeof sales.$inferSelect {
  return {
    id: Number(row.id),
    invoiceNo: String(row.invoice_no),
    date: row.date instanceof Date ? row.date : new Date(String(row.date)),
    billType: row.bill_type as "retail" | "wholesale",
    customerId: row.customer_id == null ? null : Number(row.customer_id),
    customerName: (row.customer_name as string | null) ?? null,
    paymentMode: row.payment_mode as "cash" | "upi" | "credit" | "card" | "cheque",
    operatorName: (row.operator_name as string | null) ?? null,
    subtotal: String(row.subtotal),
    discountAmount: String(row.discount_amount),
    cgst: String(row.cgst),
    sgst: String(row.sgst),
    igst: String(row.igst),
    grandTotal: String(row.grand_total),
    paidAmount: row.paid_amount == null ? null : String(row.paid_amount),
    cashAmount: String(row.cash_amount ?? "0"),
    upiAmount: String(row.upi_amount ?? "0"),
    notes: (row.notes as string | null) ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(String(row.created_at)),
  };
}

function isInvoiceNoConflict(err: unknown): boolean {
  const candidates = [err, (err as { cause?: unknown })?.cause];
  return candidates.some((e) => {
    const pg = e as { code?: string; constraint_name?: string; message?: string };
    return (
      pg?.code === "23505" &&
      (pg.constraint_name?.includes("invoice_no") ||
        pg.message?.includes("invoice_no"))
    );
  });
}

/**
 * Creates a sale with minimal DB round-trips so checkout stays fast even on a
 * remote database:
 *  1. one locked read of products + in-stock batches (FOR UPDATE serializes
 *     concurrent sales of the same products),
 *  2. one CTE statement inserting the sale (invoice number computed atomically
 *     in SQL), all sale items, and all stock movements,
 *  3. one CTE statement applying batch deductions and product stock updates.
 * FEFO allocation is computed in memory from the locked snapshot.
 */
export async function createSale(input: z.infer<typeof createSaleSchema>) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const data = createSaleSchema.parse(input);
  const settings = await getSettings();

  if (data.paymentMode === "credit" && !data.customerId) {
    throw new Error("Customer registration required for credit transactions.");
  }

  // Custom (non-inventory) items must carry their own HSN. Product items may
  // fall back to the product's HSN, validated after the product read below.
  for (const item of data.items) {
    if (!item.productId && (!item.hsnCode || !item.hsnCode.trim())) {
      throw new Error(
        `HSN code is mandatory for all items on the invoice (${item.customName || "item"}).`
      );
    }
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
  const productIds = [...productQtyMap.keys()];

  const normalizedItems = data.items.map((i) => {
    const hasExplicitValue =
      i.discountValue > 0 || i.discountType === "value";
    const discountValue = hasExplicitValue
      ? i.discountValue
      : (i.discountPercent ?? i.discountValue);
    return { ...i, discountValue };
  });

  // Resolve customer GSTIN early for IGST vs CGST/SGST (B2B interstate).
  let interstate = false;
  if (data.customerId) {
    const [cust] = await db
      .select({ gstin: customers.gstin })
      .from(customers)
      .where(eq(customers.id, data.customerId))
      .limit(1);
    interstate = isInterstateGst(cust?.gstin, settings.stateCode);
  }

  const gst = calculateGstBreakdown(
    normalizedItems.map((i) => ({
      qty: i.qty,
      rate: i.rate,
      gstRate: i.gstRate,
      discountType: i.discountType,
      discountValue: i.discountValue,
    })),
    { billDiscount: data.discountAmount ?? 0, interstate }
  );

  let cashAmount = round2(data.cashAmount ?? 0);
  let upiAmount = round2(data.upiAmount ?? 0);

  // Normalize settlement amounts for non-credit modes so UPI/Cash never stay unpaid.
  if (data.paymentMode === "upi" && cashAmount === 0 && upiAmount === 0) {
    upiAmount = gst.grandTotal;
  } else if (data.paymentMode === "cash" && cashAmount === 0 && upiAmount === 0) {
    cashAmount = gst.grandTotal;
  }

  // Non-credit modes are settled immediately at the counter.
  // Prefer explicit cash/upi split when provided; otherwise mark fully paid.
  const paidAmount =
    data.paymentMode === "credit"
      ? round2(data.paidAmount ?? 0)
      : cashAmount + upiAmount > 0
        ? round2(cashAmount + upiAmount)
        : round2(data.paidAmount ?? gst.grandTotal);

  if (
    data.billType === "retail" &&
    (data.paymentMode === "cash" || data.paymentMode === "upi") &&
    cashAmount + upiAmount > 0 &&
    Math.abs(cashAmount + upiAmount - gst.grandTotal) > 0.01
  ) {
    throw new Error("Cash + UPI amounts must equal the bill grand total.");
  }

  // Guard: cash/card/upi/cheque invoices must never remain unpaid.
  if (
    data.paymentMode !== "credit" &&
    Math.abs(paidAmount - gst.grandTotal) > 0.01 &&
    paidAmount < gst.grandTotal
  ) {
    throw new Error(
      `Payment incomplete for ${data.paymentMode.toUpperCase()} sale. Paid ₹${paidAmount.toFixed(2)} of ₹${gst.grandTotal.toFixed(2)}.`
    );
  }

  const typePrefix =
    data.billType === "wholesale" ? "WHL" : settings.invoicePrefix;
  const prefix = `${typePrefix}-${format(new Date(), "yyyyMMdd")}-`;

  const executeSale = () =>
    db.transaction(async (tx) => {
      type BatchRow = {
        batchId: number;
        batchNumber: string;
        qty: number;
        expiryDate: string | null;
      };
      const productInfo = new Map<
        number,
        { name: string; hsnCode: string | null; batches: BatchRow[] }
      >();

      if (productIds.length > 0) {
        const idList = sql.join(
          productIds.map((id) => sql`${id}`),
          sql`, `
        );
        // Single locked read: FOR UPDATE OF p serializes concurrent sales of
        // the same products, so the joined batch snapshot is authoritative.
        const rows = (await tx.execute(sql`
          select
            p.id as product_id,
            p.name as product_name,
            p.hsn_code as hsn_code,
            b.id as batch_id,
            b.batch_number as batch_number,
            b.qty as batch_qty,
            b.expiry_date as expiry_date
          from products p
          left join product_batches b
            on b.product_id = p.id and b.qty::numeric > 0
          where p.id in (${idList})
          order by
            p.id asc,
            (b.expiry_date is null) asc,
            b.expiry_date asc,
            b.id asc
          for update of p
        `)) as unknown as Array<Record<string, unknown>>;

        for (const row of rows) {
          const pid = Number(row.product_id);
          if (!productInfo.has(pid)) {
            productInfo.set(pid, {
              name: String(row.product_name),
              hsnCode: (row.hsn_code as string | null) ?? null,
              batches: [],
            });
          }
          if (row.batch_id != null) {
            productInfo.get(pid)!.batches.push({
              batchId: Number(row.batch_id),
              batchNumber: String(row.batch_number),
              qty: parseFloat(String(row.batch_qty)),
              expiryDate: toDateString(row.expiry_date),
            });
          }
        }

        for (const [productId, totalQty] of productQtyMap) {
          const info = productInfo.get(productId);
          if (!info) throw new Error(`Product ${productId} not found`);
          const available = info.batches.reduce((s, b) => s + b.qty, 0);
          if (available <= 0) {
            throw new Error(`${info.name} is out of stock and cannot be sold.`);
          }
          if (available < totalQty) {
            throw new Error(
              `Insufficient stock for ${info.name}. Available: ${available}, requested: ${totalQty}`
            );
          }
        }

        for (const item of normalizedItems) {
          if (!item.productId) continue;
          const effectiveHsn =
            item.hsnCode || productInfo.get(item.productId)!.hsnCode;
          if (!effectiveHsn || !effectiveHsn.trim()) {
            throw new Error(
              `HSN code is mandatory for all items on the invoice (${item.customName || "Product ID: " + item.productId}).`
            );
          }
        }
      }

      // Allocate deductions in memory (pinned batch or FEFO) from the locked snapshot.
      const remaining = new Map<number, number>();
      for (const info of productInfo.values()) {
        for (const b of info.batches) remaining.set(b.batchId, b.qty);
      }

      type Deduction = { batchId: number; batchNumber: string; qty: number };
      const itemDeductions: Deduction[][] = normalizedItems.map(() => []);

      normalizedItems.forEach((item, idx) => {
        if (!item.productId) return;
        const info = productInfo.get(item.productId)!;

        if (item.batchId) {
          const batch = info.batches.find((b) => b.batchId === item.batchId);
          if (!batch) {
            throw new Error(
              "Selected batch is out of stock or does not belong to this product."
            );
          }
          const avail = remaining.get(batch.batchId) ?? 0;
          if (avail < item.qty) {
            throw new Error(
              `Insufficient qty in batch ${batch.batchNumber}. Available: ${avail}, requested: ${item.qty}`
            );
          }
          remaining.set(batch.batchId, round2(avail - item.qty));
          itemDeductions[idx].push({
            batchId: batch.batchId,
            batchNumber: batch.batchNumber,
            qty: item.qty,
          });
        } else {
          let need = item.qty;
          for (const b of info.batches) {
            if (need <= 0) break;
            const avail = remaining.get(b.batchId) ?? 0;
            if (avail <= 0) continue;
            const take = Math.min(avail, need);
            remaining.set(b.batchId, round2(avail - take));
            itemDeductions[idx].push({
              batchId: b.batchId,
              batchNumber: b.batchNumber,
              qty: take,
            });
            need = round2(need - take);
          }
          if (need > 0) {
            throw new Error(
              `Insufficient stock for ${info.name}. Requested quantity exceeds available batches.`
            );
          }
        }
      });

      let finalCustomerId = data.customerId;
      let finalCustomerName = data.customerName;

      if (
        !finalCustomerId &&
        (data.customerName?.trim() || data.customerPhone?.trim())
      ) {
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
              name:
                data.customerName?.trim() ||
                `Customer-${data.customerPhone?.trim()}`,
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
        // Match getCustomerOutstanding: only subtract UNALLOCATED receipts.
        // Allocated receipts already raise sales.paid_amount — counting them
        // again would understate outstanding and allow over-limit credit.
        const [creditRow] = (await tx.execute(sql`
          select
            c.credit_limit as credit_limit,
            coalesce((
              select sum(grand_total::numeric - coalesce(paid_amount::numeric, 0))
              from sales where customer_id = c.id
            ), 0) as sales_total,
            coalesce((
              select sum(grand_total::numeric)
              from sale_returns where customer_id = c.id
            ), 0) as returns_total,
            coalesce((
              select sum(pp.amount::numeric - coalesce(a.allocated, 0))
              from party_payments pp
              left join (
                select payment_id, sum(amount::numeric) as allocated
                from party_payment_allocations
                group by payment_id
              ) a on a.payment_id = pp.id
              where pp.customer_id = c.id and pp.type = 'receipt'
            ), 0) as unallocated_receipts
          from customers c
          where c.id = ${finalCustomerId}
        `)) as unknown as Array<Record<string, unknown>>;

        const limit = parseFloat(String(creditRow?.credit_limit ?? "0"));
        if (limit > 0) {
          const currentOutstanding =
            parseFloat(String(creditRow?.sales_total ?? "0")) -
            parseFloat(String(creditRow?.returns_total ?? "0")) -
            parseFloat(String(creditRow?.unallocated_receipts ?? "0"));

          // Credit sale may already include a partial paidAmount (advance).
          const newCredit = Math.max(0, gst.grandTotal - paidAmount);
          if (currentOutstanding + newCredit > limit) {
            throw new Error(
              `Credit limit exceeded. Outstanding: ₹${currentOutstanding.toFixed(2)}, Limit: ₹${limit.toFixed(2)}, New credit: ₹${newCredit.toFixed(2)}`
            );
          }
        }
      }

      const itemValues = normalizedItems.map((item, idx) => {
        const amount = calculateLineAmount(
          item.qty,
          item.rate,
          item.discountValue,
          item.discountType
        );
        const deductions = itemDeductions[idx];
        const batchLabel = deductions.length
          ? deductions.map((d) => `${d.batchNumber}(${d.qty})`).join(", ")
          : null;
        const discountPercent =
          item.discountType === "percent" ? item.discountValue : 0;

        return sql`(${item.productId ?? null}::int, ${item.customName || null}::text, ${item.qty.toFixed(2)}::numeric, ${item.rate.toFixed(2)}::numeric, ${discountPercent.toFixed(2)}::numeric, ${item.discountType}::text, ${item.discountValue.toFixed(2)}::numeric, ${item.gstRate.toFixed(2)}::numeric, ${amount.toFixed(2)}::numeric, ${item.hsnCode || null}::text, ${deductions[0]?.batchId ?? null}::int, ${batchLabel}::text)`;
      });

      const movementValues: ReturnType<typeof sql>[] = [];
      normalizedItems.forEach((item, idx) => {
        const deductions = itemDeductions[idx];
        if (!item.productId || deductions.length === 0) return;
        const batchLabel = deductions
          .map((d) => `${d.batchNumber}(${d.qty})`)
          .join(", ");
        const note = item.batchId ? `Batch ${batchLabel}` : `FEFO ${batchLabel}`;
        for (const d of deductions) {
          movementValues.push(
            sql`(${item.productId}::int, ${d.batchId}::int, ${d.batchNumber}::text, ${(-d.qty).toFixed(2)}::numeric, ${note}::text)`
          );
        }
      });

      const movementsCte = movementValues.length
        ? sql`, ins_movements as (
            insert into stock_movements (product_id, batch_id, batch_number, type, qty_delta, reference_id, notes)
            select v.product_id, v.batch_id, v.batch_number, 'sale'::stock_movement_type, v.qty_delta, ns.id, v.notes
            from new_sale ns
            cross join (values ${sql.join(movementValues, sql`, `)})
              as v(product_id, batch_id, batch_number, qty_delta, notes)
          )`
        : sql``;

      // Invoice number is computed inside the INSERT so numbering stays atomic;
      // the unique constraint on invoice_no plus a retry covers rare races.
      const createdRows = (await tx.execute(sql`
        with new_sale as (
          insert into sales (
            invoice_no, bill_type, customer_id, customer_name, payment_mode,
            operator_name, subtotal, discount_amount, cgst, sgst, igst,
            grand_total, paid_amount, cash_amount, upi_amount, notes
          )
          select
            ${prefix} || lpad((coalesce(max(nullif(substring(s.invoice_no from '([0-9]+)$'), '')::int), 0) + 1)::text, greatest(4, length((coalesce(max(nullif(substring(s.invoice_no from '([0-9]+)$'), '')::int), 0) + 1)::text)), '0'),
            ${data.billType}::bill_type,
            ${finalCustomerId ?? null}::int,
            ${finalCustomerName ?? null}::text,
            ${data.paymentMode}::payment_mode,
            ${data.operatorName ?? settings.defaultOperator}::text,
            ${gst.subtotal.toFixed(2)}::numeric,
            ${gst.discountAmount.toFixed(2)}::numeric,
            ${gst.cgst.toFixed(2)}::numeric,
            ${gst.sgst.toFixed(2)}::numeric,
            ${gst.igst.toFixed(2)}::numeric,
            ${gst.grandTotal.toFixed(2)}::numeric,
            ${paidAmount.toFixed(2)}::numeric,
            ${cashAmount.toFixed(2)}::numeric,
            ${upiAmount.toFixed(2)}::numeric,
            ${data.notes ?? null}::text
          from sales s
          where s.invoice_no like ${prefix + "%"}
          returning *
        ),
        ins_items as (
          insert into sale_items (
            sale_id, product_id, custom_name, qty, rate, discount_percent,
            discount_type, discount_value, gst_rate, amount, hsn_code,
            batch_id, batch_number
          )
          select
            ns.id, v.product_id, v.custom_name, v.qty, v.rate, v.discount_percent,
            v.discount_type, v.discount_value, v.gst_rate, v.amount, v.hsn_code,
            v.batch_id, v.batch_number
          from new_sale ns
          cross join (values ${sql.join(itemValues, sql`, `)})
            as v(product_id, custom_name, qty, rate, discount_percent, discount_type, discount_value, gst_rate, amount, hsn_code, batch_id, batch_number)
        )
        ${movementsCte}
        select * from new_sale
      `)) as unknown as Array<Record<string, unknown>>;

      const created = mapSaleRow(createdRows[0]);

      // Apply all batch deductions and product stock/expiry updates in one statement.
      const batchTakes = new Map<number, number>();
      for (const deductions of itemDeductions) {
        for (const d of deductions) {
          batchTakes.set(d.batchId, round2((batchTakes.get(d.batchId) ?? 0) + d.qty));
        }
      }

      if (batchTakes.size > 0) {
        const batchVals = [...batchTakes].map(
          ([batchId, take]) => sql`(${batchId}::int, ${take.toFixed(2)}::numeric)`
        );
        const idList = sql.join(
          productIds.map((id) => sql`${id}`),
          sql`, `
        );

        // One statement: deduct batches and refresh product stock + nearest
        // expiry (same semantics as syncProductStockQty). The aggregate reads
        // the statement snapshot, so takes are subtracted explicitly.
        await tx.execute(sql`
          with takes as (
            select * from (values ${sql.join(batchVals, sql`, `)}) as t(batch_id, take)
          ),
          batch_upd as (
            update product_batches pb
            set qty = pb.qty - t.take, updated_at = now()
            from takes t
            where pb.id = t.batch_id
          )
          update products p
          set stock_qty = agg.total,
              expiry_date = agg.nearest
          from (
            select
              b.product_id,
              coalesce(sum(b.qty::numeric - coalesce(t.take, 0)), 0) as total,
              min(b.expiry_date) filter (where b.qty::numeric - coalesce(t.take, 0) > 0) as nearest
            from product_batches b
            left join takes t on t.batch_id = b.id
            where b.product_id in (${idList})
            group by b.product_id
          ) agg
          where p.id = agg.product_id
        `);
      }

      return created;
    });

  let sale: typeof sales.$inferSelect;
  try {
    sale = await executeSale();
  } catch (err) {
    // Two concurrent bills can compute the same invoice number; retry once.
    if (isInvoiceNoConflict(err)) {
      sale = await executeSale();
    } else {
      throw err;
    }
  }

  revalidateTag("sales", "max");
  revalidateTag("products", "max");
  revalidateTag("customers", "max");
  revalidatePath("/invoices");
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

export type SaleInvoiceOption = {
  id: number;
  invoiceNo: string;
  date: Date;
  customerId: number | null;
  customerName: string;
  grandTotal: string;
  billType: string;
};

/** Search recent invoices for sale-return "against bill" picker. */
export async function searchSalesForReturn(
  query: string,
  options?: { customerId?: number; limit?: number }
): Promise<SaleInvoiceOption[]> {
  const q = query.trim();
  const limit = options?.limit ?? 20;
  const filters = [];

  if (options?.customerId) {
    filters.push(eq(sales.customerId, options.customerId));
  }
  if (q) {
    filters.push(
      sql`(
        ${sales.invoiceNo} ilike ${"%" + q + "%"}
        or coalesce(${sales.customerName}, '') ilike ${"%" + q + "%"}
        or coalesce(${customers.name}, '') ilike ${"%" + q + "%"}
      )`
    );
  }

  const rows = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      customerId: sales.customerId,
      customerName: sql<string>`coalesce(${customers.name}, ${sales.customerName}, 'Walk-in')`,
      grandTotal: sales.grandTotal,
      billType: sales.billType,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(sales.date))
    .limit(limit);

  return rows;
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
      customerAddress: customers.address,
      cashAmount: sales.cashAmount,
      upiAmount: sales.upiAmount,
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

export type SalesReportInvoice = {
  id: number;
  invoiceNo: string;
  date: Date;
  billType: string;
  customerName: string;
  paymentMode: string;
  operatorName: string;
  subtotal: number;
  discountAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  paidAmount: number;
};

export type SalesReportLineItem = {
  invoiceNo: string;
  date: Date;
  billType: string;
  customerName: string;
  paymentMode: string;
  productName: string;
  hsnCode: string;
  qty: number;
  rate: number;
  discountType: string;
  discountValue: number;
  gstRate: number;
  amount: number;
  grandTotal: number;
};

export type SalesReportData = {
  fromDate: string;
  toDate: string;
  summary: {
    billCount: number;
    retailCount: number;
    wholesaleCount: number;
    subtotal: number;
    discountAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    grandTotal: number;
    paidAmount: number;
    byPaymentMode: Record<string, { count: number; amount: number }>;
  };
  invoices: SalesReportInvoice[];
  lineItems: SalesReportLineItem[];
};

function toNum(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getSalesReport(
  fromDate: string,
  toDate: string
): Promise<SalesReportData> {
  const { getCurrentUser, getVisibleCustomerIds } = await import(
    "@/lib/actions/auth"
  );
  const user = await getCurrentUser();
  let customerIds: number[] | null = null;
  if (user) {
    customerIds = await getVisibleCustomerIds(user);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  if (fromDate > toDate) {
    throw new Error("From date cannot be after To date.");
  }

  const from = new Date(`${fromDate}T00:00:00+05:30`);
  const to = new Date(`${toDate}T23:59:59.999+05:30`);

  const conditions = [gte(sales.date, from), lte(sales.date, to)];

  if (customerIds !== null) {
    if (customerIds.length === 0) {
      return {
        fromDate,
        toDate,
        summary: {
          billCount: 0,
          retailCount: 0,
          wholesaleCount: 0,
          subtotal: 0,
          discountAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          grandTotal: 0,
          paidAmount: 0,
          byPaymentMode: {},
        },
        invoices: [],
        lineItems: [],
      };
    }
    conditions.push(inArray(sales.customerId, customerIds));
  }

  const invoiceRows = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      billType: sales.billType,
      customerName: sales.customerName,
      customerRecordName: customers.name,
      paymentMode: sales.paymentMode,
      operatorName: sales.operatorName,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      cgst: sales.cgst,
      sgst: sales.sgst,
      igst: sales.igst,
      grandTotal: sales.grandTotal,
      paidAmount: sales.paidAmount,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(sales.date));

  const invoices: SalesReportInvoice[] = invoiceRows.map((row) => ({
    id: row.id,
    invoiceNo: row.invoiceNo,
    date: row.date,
    billType: row.billType,
    customerName: row.customerRecordName || row.customerName || "Walk-in",
    paymentMode: row.paymentMode,
    operatorName: row.operatorName || "-",
    subtotal: toNum(row.subtotal),
    discountAmount: toNum(row.discountAmount),
    cgst: toNum(row.cgst),
    sgst: toNum(row.sgst),
    igst: toNum(row.igst),
    grandTotal: toNum(row.grandTotal),
    paidAmount: toNum(row.paidAmount),
  }));

  const saleIds = invoices.map((inv) => inv.id);
  let lineItems: SalesReportLineItem[] = [];

  if (saleIds.length > 0) {
    const itemRows = await db
      .select({
        invoiceNo: sales.invoiceNo,
        date: sales.date,
        billType: sales.billType,
        customerName: sales.customerName,
        customerRecordName: customers.name,
        paymentMode: sales.paymentMode,
        productName: products.name,
        customName: saleItems.customName,
        hsnCode: sql<string>`coalesce(${saleItems.hsnCode}, ${products.hsnCode})`,
        qty: saleItems.qty,
        rate: saleItems.rate,
        discountType: saleItems.discountType,
        discountValue: saleItems.discountValue,
        gstRate: saleItems.gstRate,
        amount: saleItems.amount,
        grandTotal: sales.grandTotal,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .leftJoin(products, eq(saleItems.productId, products.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(inArray(saleItems.saleId, saleIds))
      .orderBy(desc(sales.date), saleItems.id);

    lineItems = itemRows.map((row) => ({
      invoiceNo: row.invoiceNo,
      date: row.date,
      billType: row.billType,
      customerName: row.customerRecordName || row.customerName || "Walk-in",
      paymentMode: row.paymentMode,
      productName: row.productName || row.customName || "Item",
      hsnCode: row.hsnCode || "",
      qty: toNum(row.qty),
      rate: toNum(row.rate),
      discountType: row.discountType || "percent",
      discountValue: toNum(row.discountValue),
      gstRate: toNum(row.gstRate),
      amount: toNum(row.amount),
      grandTotal: toNum(row.grandTotal),
    }));
  }

  const byPaymentMode: Record<string, { count: number; amount: number }> = {};
  let retailCount = 0;
  let wholesaleCount = 0;
  let subtotal = 0;
  let discountAmount = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let grandTotal = 0;
  let paidAmount = 0;

  for (const inv of invoices) {
    if (inv.billType === "wholesale") wholesaleCount++;
    else retailCount++;
    subtotal += inv.subtotal;
    discountAmount += inv.discountAmount;
    cgst += inv.cgst;
    sgst += inv.sgst;
    igst += inv.igst;
    grandTotal += inv.grandTotal;
    paidAmount += inv.paidAmount;
    const mode = inv.paymentMode || "cash";
    if (!byPaymentMode[mode]) byPaymentMode[mode] = { count: 0, amount: 0 };
    byPaymentMode[mode].count++;
    byPaymentMode[mode].amount += inv.grandTotal;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    fromDate,
    toDate,
    summary: {
      billCount: invoices.length,
      retailCount,
      wholesaleCount,
      subtotal: round2(subtotal),
      discountAmount: round2(discountAmount),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: round2(igst),
      grandTotal: round2(grandTotal),
      paidAmount: round2(paidAmount),
      byPaymentMode,
    },
    invoices,
    lineItems,
  };
}
