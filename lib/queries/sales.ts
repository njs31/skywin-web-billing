import { db } from "@/db";
import {
  sales,
  saleItems,
  products,
  productBatches,
  categories,
  customers,
  partyPayments,
  partyPaymentAllocations,
  stockMovements,
  saleReturns,
} from "@/db/schema";
import { stateNameFromGstin } from "@/lib/gst-states";
import { buildAutoReceiptParts } from "@/lib/sale-settlement";
import {
  calculateGstBreakdown,
  calculateLineAmount,
  isInterstateGst,
  applyRupeeRounding,
  einvoiceReadiness,
  ewayBillReadiness,
  EWAY_BILL_THRESHOLD_INTERSTATE,
  EWAY_BILL_THRESHOLD_INTRASTATE_TN,
} from "@/lib/gst";
import { getSettings } from "@/lib/settings";
import { getIndianFinancialYearBounds, WHOLESALE_INVOICE_PREFIX, WHOLESALE_INVOICE_SEQ_FLOOR } from "@/lib/financial-year";
import { format } from "date-fns";
import { desc, asc, eq, ne, gte, lt, lte, sql, and, inArray } from "drizzle-orm";

/** Reusable predicate: exclude cancelled invoices from reports/totals. */
export const activeSale = ne(sales.status, "cancelled");
import { z } from "zod";

export const saleItemSchema = z.object({
  productId: z.number().optional().nullable(),
  customName: z.string().optional(),
  qty: z.number().positive(),
  rate: z.number().nonnegative(),
  gstRate: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountType: z.enum(["percent", "value"]).default("percent"),
  discountValue: z.number().min(0).default(0),
  hsnCode: z.string().optional().nullable(),
  /** Cashier-chosen unit for custom lines; product lines use products.unit. */
  unit: z.string().optional().nullable(),
  batchId: z.number().optional().nullable(),
});

export const createSaleSchema = z.object({
  billType: z.enum(["retail", "wholesale", "others"]).default("retail"),
  customerId: z.number().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  paymentMode: z.enum(["cash", "upi", "credit", "card", "cheque", "neft"]),
  operatorName: z.string().optional(),
  discountAmount: z.number().min(0).optional(),
  paidAmount: z.number().min(0).optional(),
  cashAmount: z.number().min(0).optional(),
  upiAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
  poNumber: z.string().optional(),
  purchaseOrderId: z.number().optional(),
  quotationNumber: z.string().optional(),
  ewayBillNo: z.string().optional(),
  vehicleNo: z.string().optional(),
  dispatchedThrough: z.string().optional(),
  destination: z.string().optional(),
  deliveryNote: z.string().optional(),
  paymentTerms: z.string().optional(),
  transporterName: z.string().optional(),
  transporterGstin: z.string().optional(),
  distanceKm: z.number().nonnegative().optional(),
  eInvoiceRequested: z.boolean().optional(),
  externalOrderId: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
});

/**
 * Edit-invoice input: everything a fresh bill takes except the series
 * fields — bill type, date and invoice number never change on edit (the
 * FY series must stay continuous and the IRP window is date-bound).
 */
export const updateSaleSchema = createSaleSchema
  .omit({ billType: true })
  .extend({ saleId: z.number().int().positive() });

export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;

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
    billType: row.bill_type as "retail" | "wholesale" | "others",
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
    roundOff: String(row.round_off ?? "0"),
    paidAmount: row.paid_amount == null ? null : String(row.paid_amount),
    cashAmount: String(row.cash_amount ?? "0"),
    upiAmount: String(row.upi_amount ?? "0"),
    poNumber: (row.po_number as string | null) ?? null,
    purchaseOrderId:
      row.purchase_order_id == null ? null : Number(row.purchase_order_id),
    quotationNumber: (row.quotation_number as string | null) ?? null,
    ewayBillNo: (row.eway_bill_no as string | null) ?? null,
    vehicleNo: (row.vehicle_no as string | null) ?? null,
    dispatchedThrough: (row.dispatched_through as string | null) ?? null,
    destination: (row.destination as string | null) ?? null,
    deliveryNote: (row.delivery_note as string | null) ?? null,
    paymentTerms: (row.payment_terms as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    transporterName: (row.transporter_name as string | null) ?? null,
    externalOrderId: (row.external_order_id as string | null) ?? null,
    eInvoiceRequested: Boolean(row.e_invoice_requested),
    status: (row.status as string | null) ?? "active",
    cancelledAt:
      row.cancelled_at == null ? null : new Date(String(row.cancelled_at)),
    cancelledBy: (row.cancelled_by as string | null) ?? null,
    cancelReason: (row.cancel_reason as string | null) ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(String(row.created_at)),
    einvoiceStatus: (row.einvoice_status as string | null) ?? "none",
    irn: (row.irn as string | null) ?? null,
    ackNo: (row.ack_no as string | null) ?? null,
    ackDate: row.ack_date == null ? null : new Date(String(row.ack_date)),
    signedQr: (row.signed_qr as string | null) ?? null,
    einvoiceError: (row.einvoice_error as string | null) ?? null,
    einvoiceRaw: (row.einvoice_raw as string | null) ?? null,
    ewbStatus: (row.ewb_status as string | null) ?? "none",
    ewbId: (row.ewb_id as string | null) ?? null,
    ewbNo: (row.ewb_no as string | null) ?? null,
    ewbGeneratedAt:
      row.ewb_generated_at == null ? null : new Date(String(row.ewb_generated_at)),
    ewbValidUntil:
      row.ewb_valid_until == null ? null : new Date(String(row.ewb_valid_until)),
    ewbError: (row.ewb_error as string | null) ?? null,
    ewbRaw: (row.ewb_raw as string | null) ?? null,
    transporterGstin: (row.transporter_gstin as string | null) ?? null,
    transportMode: (row.transport_mode as string | null) ?? null,
    distanceKm: row.distance_km == null ? null : String(row.distance_km),
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
 * Shared sale-line engine: createSale and updateSale run the exact same
 * stock, tax and receipt logic — an edit is a restore plus a re-bill in
 * one transaction, reusing every helper below. Pure pieces
 * (normalize/settlement/allocation) are unit-tested; DB pieces take the
 * transaction client.
 */

type SaleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NormalizedSaleItem = {
  productId?: number | null;
  customName?: string;
  qty: number;
  rate: number;
  gstRate: number;
  discountPercent?: number;
  discountType: "percent" | "value";
  discountValue: number;
  hsnCode?: string | null;
  unit?: string | null;
  batchId?: number | null;
};

/** Fold percent discounts into discountValue, like POS checkout does. */
export function normalizeSaleItems(
  items: Array<{
    productId?: number | null;
    customName?: string;
    qty: number;
    rate: number;
    gstRate: number;
    discountPercent?: number;
    discountType: "percent" | "value";
    discountValue: number;
    hsnCode?: string | null;
    unit?: string | null;
    batchId?: number | null;
  }>
): NormalizedSaleItem[] {
  return items.map((i) => {
    const hasExplicitValue =
      i.discountValue > 0 || i.discountType === "value";
    const discountValue = hasExplicitValue
      ? i.discountValue
      : (i.discountPercent ?? i.discountValue);
    return { ...i, discountValue };
  });
}

export type SaleSettlementInput = {
  billType: "retail" | "wholesale" | "others";
  paymentMode: "cash" | "upi" | "credit" | "card" | "cheque" | "neft";
  cashAmount?: number;
  upiAmount?: number;
  paidAmount?: number;
  discountAmount?: number;
};

/**
 * GST totals plus payment normalization/validation — the same rupee
 * rounding, split-payment alignment and incomplete-payment guards as
 * counter checkout, so an edited bill can never be saved half-paid.
 */
export function computeSaleSettlement(
  input: SaleSettlementInput,
  normalizedItems: NormalizedSaleItem[],
  interstate: boolean
) {
  const gst = applyRupeeRounding(
    calculateGstBreakdown(
      normalizedItems.map((i) => ({
        qty: i.qty,
        rate: i.rate,
        gstRate: i.gstRate,
        discountType: i.discountType,
        discountValue: i.discountValue,
      })),
      { billDiscount: input.discountAmount ?? 0, interstate }
    )
  );
  const roundOff = gst.roundOff ?? 0;

  let cashAmount = round2(input.cashAmount ?? 0);
  let upiAmount = round2(input.upiAmount ?? 0);

  if (input.paymentMode === "upi" && cashAmount === 0 && upiAmount === 0) {
    upiAmount = gst.grandTotal;
  } else if (input.paymentMode === "cash" && cashAmount === 0 && upiAmount === 0) {
    cashAmount = gst.grandTotal;
  }

  let paidAmount =
    input.paymentMode === "credit"
      ? round2(input.paidAmount ?? 0)
      : cashAmount + upiAmount > 0
        ? round2(cashAmount + upiAmount)
        : round2(input.paidAmount ?? gst.grandTotal);

  if (
    input.paymentMode !== "credit" &&
    cashAmount + upiAmount > 0 &&
    Math.abs(cashAmount + upiAmount - gst.grandTotal) > 0.01 &&
    Math.abs(cashAmount + upiAmount - (gst.grandTotal - roundOff)) <= 0.02
  ) {
    const diff = round2(gst.grandTotal - (cashAmount + upiAmount));
    if (upiAmount > 0) upiAmount = round2(upiAmount + diff);
    else cashAmount = round2(cashAmount + diff);
    paidAmount = round2(cashAmount + upiAmount);
  } else if (
    input.paymentMode !== "credit" &&
    cashAmount + upiAmount === 0 &&
    Math.abs(paidAmount - (gst.grandTotal - roundOff)) <= 0.02
  ) {
    paidAmount = gst.grandTotal;
  }

  if (
    input.billType === "retail" &&
    (input.paymentMode === "cash" || input.paymentMode === "upi") &&
    cashAmount + upiAmount > 0 &&
    Math.abs(cashAmount + upiAmount - gst.grandTotal) > 0.01
  ) {
    throw new Error("Cash + UPI amounts must equal the bill grand total.");
  }

  if (
    input.paymentMode !== "credit" &&
    Math.abs(paidAmount - gst.grandTotal) > 0.01 &&
    paidAmount < gst.grandTotal
  ) {
    throw new Error(
      `Payment incomplete for ${input.paymentMode.toUpperCase()} sale. Paid ₹${paidAmount.toFixed(2)} of ₹${gst.grandTotal.toFixed(2)}.`
    );
  }

  return { gst, roundOff, cashAmount, upiAmount, paidAmount };
}

export type BatchStockRow = {
  batchId: number;
  batchNumber: string;
  qty: number;
  expiryDate: string | null;
};

export type ProductStockInfo = {
  name: string;
  hsnCode: string | null;
  batches: BatchStockRow[];
};

/** Locked product + in-stock batch snapshot (FOR UPDATE serializes sellers). */
export async function lockProductsWithBatches(
  tx: SaleTx,
  productIds: number[]
): Promise<Map<number, ProductStockInfo>> {
  const productInfo = new Map<number, ProductStockInfo>();
  if (productIds.length === 0) return productInfo;
  const idList = sql.join(
    productIds.map((id) => sql`${id}`),
    sql`, `
  );
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
  return productInfo;
}

/** Stock sufficiency + HSN presence, against the locked snapshot. */
export function checkStockAndHsn(
  productInfo: Map<number, ProductStockInfo>,
  productQtyMap: Map<number, number>,
  normalizedItems: NormalizedSaleItem[]
): void {
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

export type Deduction = { batchId: number; batchNumber: string; qty: number };

/**
 * Allocate deductions in memory from the locked snapshot: a pinned batch
 * when the line names one, FEFO otherwise. Pure — unit-tested.
 */
export function allocateDeductions(
  productInfo: Map<number, ProductStockInfo>,
  normalizedItems: NormalizedSaleItem[]
): Deduction[][] {
  const remaining = new Map<number, number>();
  for (const info of productInfo.values()) {
    for (const b of info.batches) remaining.set(b.batchId, b.qty);
  }

  return normalizedItems.map((item) => {
    if (!item.productId) return [];
    const info = productInfo.get(item.productId)!;
    const taken: Deduction[] = [];

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
      taken.push({
        batchId: batch.batchId,
        batchNumber: batch.batchNumber,
        qty: item.qty,
      });
      return taken;
    }

    let need = item.qty;
    for (const b of info.batches) {
      if (need <= 0) break;
      const avail = remaining.get(b.batchId) ?? 0;
      if (avail <= 0) continue;
      const take = Math.min(avail, need);
      remaining.set(b.batchId, round2(avail - take));
      taken.push({ batchId: b.batchId, batchNumber: b.batchNumber, qty: take });
      need = round2(need - take);
    }
    if (need > 0) {
      throw new Error(
        `Insufficient stock for ${info.name}. Requested quantity exceeds available batches.`
      );
    }
    return taken;
  });
}

export type RestoreLine = {
  productId: number | null;
  batchId: number | null;
  batchNumber: string | null;
  qty: number | string;
};

/** Put stock back for old lines (edit restore / cancellation). */
export async function restoreSaleStock(
  tx: SaleTx,
  lines: RestoreLine[],
  referenceId: number,
  notes: string
): Promise<number> {
  const perProduct = new Map<number, number>();
  for (const it of lines) {
    if (!it.productId) continue;
    const qty = toNum(it.qty);
    perProduct.set(it.productId, (perProduct.get(it.productId) ?? 0) + qty);
    if (it.batchId) {
      await tx
        .update(productBatches)
        .set({ qty: sql`${productBatches.qty}::numeric + ${qty.toFixed(2)}`, updatedAt: new Date() })
        .where(eq(productBatches.id, it.batchId));
    }
    await tx.insert(stockMovements).values({
      productId: it.productId,
      batchId: it.batchId ?? null,
      batchNumber: it.batchNumber ?? null,
      type: "return",
      qtyDelta: qty.toFixed(2),
      referenceId,
      notes,
    });
  }
  for (const [productId, qty] of perProduct) {
    await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty}::numeric + ${qty.toFixed(2)}` })
      .where(eq(products.id, productId));
  }
  return perProduct.size;
}

/** Drop a sale's lines, its sale movements and its auto receipts. */
export async function deleteSaleLinesReceiptsAndMovements(
  tx: SaleTx,
  saleId: number
): Promise<void> {
  await tx.delete(saleItems).where(eq(saleItems.saleId, saleId));
  await tx
    .delete(stockMovements)
    .where(
      and(
        eq(stockMovements.referenceId, saleId),
        eq(stockMovements.type, "sale")
      )
    );
  const allocations = await tx
    .select({ paymentId: partyPaymentAllocations.paymentId })
    .from(partyPaymentAllocations)
    .where(eq(partyPaymentAllocations.saleId, saleId));
  const paymentIds = [...new Set(allocations.map((a) => a.paymentId))];
  for (const pid of paymentIds) {
    // Allocations cascade off the payment row — same as cancellation.
    await tx.delete(partyPayments).where(eq(partyPayments.id, pid));
  }
}

/** One statement: deduct batches, refresh product stock + nearest expiry. */
export async function applyBatchDeductions(
  tx: SaleTx,
  itemDeductions: Deduction[][],
  productIds: number[]
): Promise<void> {
  const batchTakes = new Map<number, number>();
  for (const deductions of itemDeductions) {
    for (const d of deductions) {
      batchTakes.set(d.batchId, round2((batchTakes.get(d.batchId) ?? 0) + d.qty));
    }
  }
  if (batchTakes.size === 0) return;
  const batchVals = [...batchTakes].map(
    ([batchId, take]) => sql`(${batchId}::int, ${take.toFixed(2)}::numeric)`
  );
  const idList = sql.join(
    productIds.map((id) => sql`${id}`),
    sql`, `
  );
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

/** Insert lines + sale movements for a known sale id (the edit path). */
export async function insertSaleItemsAndMovements(
  tx: SaleTx,
  saleId: number,
  normalizedItems: NormalizedSaleItem[],
  itemDeductions: Deduction[][]
): Promise<void> {
  for (const [idx, item] of normalizedItems.entries()) {
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
    await tx.insert(saleItems).values({
      saleId,
      productId: item.productId ?? null,
      customName: item.customName || null,
      qty: item.qty.toFixed(2),
      rate: item.rate.toFixed(2),
      discountPercent:
        item.discountType === "percent" ? item.discountValue.toFixed(2) : "0",
      discountType: item.discountType,
      discountValue: item.discountValue.toFixed(2),
      gstRate: item.gstRate.toFixed(2),
      amount: amount.toFixed(2),
      hsnCode: item.hsnCode || null,
      unit: item.unit?.trim() || null,
      batchId: deductions[0]?.batchId ?? null,
      batchNumber: batchLabel,
    });
    for (const d of deductions) {
      await tx.insert(stockMovements).values({
        productId: item.productId!,
        batchId: d.batchId,
        batchNumber: d.batchNumber,
        type: "sale",
        qtyDelta: (-d.qty).toFixed(2),
        referenceId: saleId,
        notes: item.batchId ? `Batch ${batchLabel}` : `FEFO ${batchLabel}`,
      });
    }
  }
}

/** Counter-settlement receipts + allocations for a sale. */
export async function createAutoReceipts(
  tx: SaleTx,
  args: {
    saleId: number;
    invoiceNo: string;
    customerId: number | null;
    paymentMode: "cash" | "upi" | "credit" | "card" | "cheque" | "neft";
    paidAmount: number;
    cashAmount: number;
    upiAmount: number;
  }
): Promise<void> {
  if (!args.customerId || !(args.paidAmount > 0)) return;
  const receiptParts = buildAutoReceiptParts({
    paymentMode: args.paymentMode,
    paidAmount: args.paidAmount,
    cashAmount: args.cashAmount,
    upiAmount: args.upiAmount,
  });
  for (const part of receiptParts) {
    const [payment] = await tx
      .insert(partyPayments)
      .values({
        type: "receipt",
        customerId: args.customerId,
        amount: part.amount.toFixed(2),
        paymentMode: part.paymentMode,
        referenceNo: args.invoiceNo,
        notes: `Auto receipt for ${args.invoiceNo} (${part.paymentMode.toUpperCase()})`,
      })
      .returning();
    await tx.insert(partyPaymentAllocations).values({
      paymentId: payment.id,
      saleId: args.saleId,
      amount: part.amount.toFixed(2),
    });
  }
}

/**
 * Credit-limit check. `oldOutstandingBalance` is this bill's own current
 * unpaid amount (grandTotal − paid) — zero for a fresh bill, so createSale
 * passes 0 and updateSale passes the pre-edit balance.
 */
export async function checkCreditLimit(
  tx: SaleTx,
  customerId: number,
  newGrandTotal: number,
  newPaidAmount: number,
  oldOutstandingBalance = 0
): Promise<void> {
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
    where c.id = ${customerId}
  `)) as unknown as Array<Record<string, unknown>>;

  const limit = parseFloat(String(creditRow?.credit_limit ?? "0"));
  if (!(limit > 0)) return;
  const currentOutstanding =
    parseFloat(String(creditRow?.sales_total ?? "0")) -
    parseFloat(String(creditRow?.returns_total ?? "0")) -
    parseFloat(String(creditRow?.unallocated_receipts ?? "0"));

  const newCredit = Math.max(0, newGrandTotal - newPaidAmount);
  if (currentOutstanding - oldOutstandingBalance + newCredit > limit) {
    throw new Error(
      `Credit limit exceeded. Outstanding: ₹${(currentOutstanding - oldOutstandingBalance).toFixed(2)}, Limit: ₹${limit.toFixed(2)}, New credit: ₹${newCredit.toFixed(2)}`
    );
  }
}

/** Find-or-create the bill customer (matches by phone, then name). */
export async function resolveSaleCustomer(
  tx: SaleTx,
  data: { customerId?: number; customerName?: string; customerPhone?: string }
): Promise<{ finalCustomerId: number | undefined; finalCustomerName: string | undefined }> {
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

  return { finalCustomerId, finalCustomerName };
}

/**
 * Sale-completion gate: when a bill becomes e-invoice/e-way bill eligible,
 * the required details must already be present — staff cannot save the
 * bill and "fix it later". Runs inside the billing transaction in both
 * createSale and updateSale, so no caller (POS, edit page, orders API)
 * can bypass it.
 */
export async function enforceComplianceDetails(
  tx: SaleTx,
  args: {
    customerId?: number | null;
    customerName?: string | null;
    grandTotal: number;
    interstate: boolean;
    vehicleNo?: string | null;
    transporterName?: string | null;
    distanceKm?: number | null;
  }
): Promise<void> {
  if (args.customerId) {
    const [master] = await tx
      .select({
        gstin: customers.gstin,
        address: customers.address,
        district: customers.district,
        village: customers.village,
        taluk: customers.taluk,
        pinCode: customers.pinCode,
      })
      .from(customers)
      .where(eq(customers.id, args.customerId))
      .limit(1);
    const readiness = einvoiceReadiness(master ?? null);
    if (readiness.eligible && readiness.missing.length > 0) {
      const who = args.customerName?.trim() || "This customer";
      throw new Error(
        `Cannot complete sale: ${who} is missing ${readiness.missing.join(", ")} for e-Invoice. Fix the customer record first.`
      );
    }
  }

  const eway = ewayBillReadiness({
    grandTotal: args.grandTotal,
    interstate: args.interstate,
    vehicleNo: args.vehicleNo,
    transporterName: args.transporterName,
    distanceKm: args.distanceKm,
  });
  if (eway.required && eway.missing.length > 0) {
    const threshold = args.interstate
      ? `above ₹${EWAY_BILL_THRESHOLD_INTERSTATE.toLocaleString("en-IN")} (interstate)`
      : `above ₹${EWAY_BILL_THRESHOLD_INTRASTATE_TN.toLocaleString("en-IN")} (within Tamil Nadu)`;
    throw new Error(
      `Cannot complete sale: e-way bill is required ${threshold} — enter ${eway.missing.join(", ")}.`
    );
  }
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

  const normalizedItems = normalizeSaleItems(data.items);

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

  const { gst, roundOff, cashAmount, upiAmount, paidAmount } =
    computeSaleSettlement(
      {
        billType: data.billType,
        paymentMode: data.paymentMode,
        cashAmount: data.cashAmount,
        upiAmount: data.upiAmount,
        paidAmount: data.paidAmount,
        discountAmount: data.discountAmount,
      },
      normalizedItems,
      interstate
    );

  const isWholesale = data.billType === "wholesale";
  // Retail series: INV-YYYYMMDD-NNNN with an FY-continuous sequence (never
  // restarts by day or month — it continues from the last bill of the
  // previous month). Retail bills are B2C and never go to the IRP, so the
  // 17-char length is fine; wholesale (SKYA/…) is unchanged.
  const dayStamp = format(new Date(), "yyyyMMdd");
  const retailPrefix = `${settings.invoicePrefix}-${dayStamp}-`;
  const { start: fyStart, end: fyEnd, shortLabel: fyShortLabel } =
    getIndianFinancialYearBounds();
  // postgres.js raw sql cannot bind JS Date — must pass ISO strings
  const fyStartIso = fyStart.toISOString();
  const fyEndIso = fyEnd.toISOString();
  const wholesaleLike = `${WHOLESALE_INVOICE_PREFIX}/%/${fyShortLabel}`;
  const wholesaleSeqRegex = `^${WHOLESALE_INVOICE_PREFIX}/([0-9]+)/`;
  const invoiceNoSelect = isWholesale
    ? sql`${WHOLESALE_INVOICE_PREFIX} || '/' || lpad((
          greatest(
            coalesce(max(case
              when s.invoice_no like ${wholesaleLike}
              then nullif(substring(s.invoice_no from ${wholesaleSeqRegex}), '')::int
            end), 0),
            coalesce(max(case
              when s.invoice_no like 'WHL-%'
              then nullif(substring(s.invoice_no from '([0-9]+)$'), '')::int
            end), 0),
            ${WHOLESALE_INVOICE_SEQ_FLOOR}
          ) + 1
        )::text, 4, '0') || '/' || ${fyShortLabel}`
    : sql`${retailPrefix} || lpad((coalesce(max(nullif(substring(s.invoice_no from '([0-9]+)$'), '')::int), 0) + 1)::text, greatest(4, length((coalesce(max(nullif(substring(s.invoice_no from '([0-9]+)$'), '')::int), 0) + 1)::text)), '0')`;
  const invoiceNoWhere = isWholesale
    ? sql`(s.invoice_no like ${wholesaleLike} or s.invoice_no like 'WHL-%')
            and s.date >= ${fyStartIso}::timestamptz
            and s.date <= ${fyEndIso}::timestamptz`
    : sql`s.invoice_no like ${settings.invoicePrefix + "-%"}
            and s.date >= ${fyStartIso}::timestamptz
            and s.date <= ${fyEndIso}::timestamptz`;
  const poNumber = data.poNumber?.trim() || null;
  const purchaseOrderId = data.purchaseOrderId ?? null;
  const quotationNumber = data.quotationNumber?.trim() || null;
  const ewayBillNo = data.ewayBillNo?.trim() || null;
  const vehicleNo = data.vehicleNo?.trim() || null;
  const dispatchedThrough = data.dispatchedThrough?.trim() || null;
  const destination = data.destination?.trim() || null;
  const deliveryNote = data.deliveryNote?.trim() || null;
  const paymentTerms = data.paymentTerms?.trim() || null;
  const transporterName = data.transporterName?.trim() || null;
  const transporterGstin = data.transporterGstin?.trim().toUpperCase() || null;
  const distanceKm = data.distanceKm != null ? data.distanceKm.toFixed(1) : null;
  const externalOrderId = data.externalOrderId?.trim() || null;
  const eInvoiceRequested = data.eInvoiceRequested ?? false;

  const executeSale = () =>
    db.transaction(async (tx) => {
      const productInfo = await lockProductsWithBatches(tx, productIds);
      checkStockAndHsn(productInfo, productQtyMap, normalizedItems);

      // Allocate deductions in memory (pinned batch or FEFO) from the locked snapshot.
      const itemDeductions = allocateDeductions(productInfo, normalizedItems);

      const { finalCustomerId, finalCustomerName } = await resolveSaleCustomer(
        tx,
        data
      );

      if (data.paymentMode === "credit" && finalCustomerId) {
        // Match getCustomerOutstanding: only subtract UNALLOCATED receipts.
        // Allocated receipts already raise sales.paid_amount — counting them
        // again would understate outstanding and allow over-limit credit.
        await checkCreditLimit(
          tx,
          finalCustomerId,
          gst.grandTotal,
          paidAmount,
          0
        );
      }

      // E-invoice/e-way bill gate: eligible bills must carry their details
      // before the sale completes — see enforceComplianceDetails.
      await enforceComplianceDetails(tx, {
        customerId: finalCustomerId,
        customerName: finalCustomerName,
        grandTotal: gst.grandTotal,
        interstate,
        vehicleNo,
        transporterName,
        distanceKm: data.distanceKm ?? null,
      });

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

        return sql`(${item.productId ?? null}::int, ${item.customName || null}::text, ${item.qty.toFixed(2)}::numeric, ${item.rate.toFixed(2)}::numeric, ${discountPercent.toFixed(2)}::numeric, ${item.discountType}::text, ${item.discountValue.toFixed(2)}::numeric, ${item.gstRate.toFixed(2)}::numeric, ${amount.toFixed(2)}::numeric, ${item.hsnCode || null}::text, ${item.unit?.trim() || null}::text, ${deductions[0]?.batchId ?? null}::int, ${batchLabel}::text)`;
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

      // Invoice number: date stamp in the string, sequence continuous within FY.
      const createdRows = (await tx.execute(sql`
        with new_sale as (
          insert into sales (
            invoice_no, bill_type, customer_id, customer_name, payment_mode,
            operator_name, subtotal, discount_amount, cgst, sgst, igst,
            grand_total, round_off, paid_amount, cash_amount, upi_amount,
            po_number, purchase_order_id, quotation_number, eway_bill_no, vehicle_no,
            dispatched_through, destination, delivery_note, payment_terms,
            transporter_name, transporter_gstin, distance_km,
            e_invoice_requested, external_order_id, notes
          )
          select
            ${invoiceNoSelect},
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
            ${roundOff.toFixed(2)}::numeric,
            ${paidAmount.toFixed(2)}::numeric,
            ${cashAmount.toFixed(2)}::numeric,
            ${upiAmount.toFixed(2)}::numeric,
            ${poNumber}::text,
            ${purchaseOrderId}::int,
            ${quotationNumber}::text,
            ${ewayBillNo}::text,
            ${vehicleNo}::text,
            ${dispatchedThrough}::text,
            ${destination}::text,
            ${deliveryNote}::text,
            ${paymentTerms}::text,
            ${transporterName}::text,
            ${transporterGstin}::text,
            ${distanceKm}::numeric,
            ${eInvoiceRequested}::boolean,
            ${externalOrderId}::text,
            ${data.notes ?? null}::text
          from sales s
          where ${invoiceNoWhere}
          returning *
        ),
        ins_items as (
          insert into sale_items (
            sale_id, product_id, custom_name, qty, rate, discount_percent,
            discount_type, discount_value, gst_rate, amount, hsn_code, unit,
            batch_id, batch_number
          )
          select
            ns.id, v.product_id, v.custom_name, v.qty, v.rate, v.discount_percent,
            v.discount_type, v.discount_value, v.gst_rate, v.amount, v.hsn_code, v.unit,
            v.batch_id, v.batch_number
          from new_sale ns
          cross join (values ${sql.join(itemValues, sql`, `)})
            as v(product_id, custom_name, qty, rate, discount_percent, discount_type, discount_value, gst_rate, amount, hsn_code, unit, batch_id, batch_number)
        )
        ${movementsCte}
        select * from new_sale
      `)) as unknown as Array<Record<string, unknown>>;

      const created = mapSaleRow(createdRows[0]);

      // Cash / card / UPI (and cheque) sales credit the party ledger automatically
      // so Tally receipts and customer outstanding stay in sync with the invoice.
      if (finalCustomerId && paidAmount > 0) {
        await createAutoReceipts(tx, {
          saleId: created.id,
          invoiceNo: created.invoiceNo,
          customerId: finalCustomerId,
          paymentMode: data.paymentMode,
          paidAmount,
          cashAmount,
          upiAmount,
        });
      }

      // Apply all batch deductions and product stock/expiry updates in one statement.
      await applyBatchDeductions(tx, itemDeductions, productIds);

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
  revalidatePath("/accounts/receipts");

  const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
  scheduleQwicksStockPush(productIds);

  return sale;
}

export async function getSales() {
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const customerIds = await getScopedCustomerIds();

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
      status: sales.status,
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

export type SaleListSort = "newest" | "oldest" | "amount-desc" | "amount-asc";
export type SaleListBillType = "all" | "retail" | "wholesale" | "others";

export type SaleListFilter = {
  q: string;
  billType: SaleListBillType;
  /** YYYY-MM-DD in Asia/Kolkata, or null for all dates. */
  day: string | null;
  sort: SaleListSort;
  page: number;
  pageSize: 20 | 50 | 100;
};

const SALE_LIST_SORTS: SaleListSort[] = [
  "newest",
  "oldest",
  "amount-desc",
  "amount-asc",
];
const SALE_LIST_BILL_TYPES: SaleListBillType[] = [
  "all",
  "retail",
  "wholesale",
  "others",
];

/** Parse/normalize URL params for the Sale Book list. Pure — unit-tested. */
export function parseSaleListParams(params: {
  q?: string;
  type?: string;
  day?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
}): SaleListFilter {
  const billType = (params.type ?? "all").toLowerCase();
  const sort = (params.sort ?? "newest").toLowerCase();
  const day = (params.day ?? "").trim();
  const pageSize = Number(params.pageSize ?? 20);
  return {
    q: (params.q ?? "").trim(),
    billType: (SALE_LIST_BILL_TYPES as string[]).includes(billType)
      ? (billType as SaleListBillType)
      : "all",
    day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
    sort: (SALE_LIST_SORTS as string[]).includes(sort)
      ? (sort as SaleListSort)
      : "newest",
    page: Math.max(1, parseInt(params.page ?? "1", 10) || 1),
    pageSize: pageSize === 50 || pageSize === 100 ? pageSize : 20,
  };
}

/**
 * IST calendar-day bounds as UTC instants (Asia/Kolkata is UTC+5:30,
 * no DST). Returns null for unparseable input. Pure — unit-tested.
 */
export function istDayRange(day: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const from = new Date(`${day}T00:00:00+05:30`);
  if (Number.isNaN(from.getTime())) return null;
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Sale Book listing with search / type / day / sort and real server-side
 * pagination. Same rows and dealer scoping as getSales (which stays
 * untouched for its other callers) — text matches invoice no., customer
 * name or amount; `day` is an IST date. Returns the page plus the total so
 * the UI renders honest pagination instead of a capped list.
 */
export async function getSalesFiltered(filter: SaleListFilter): Promise<{
  rows: Array<{
    id: number;
    invoiceNo: string;
    date: Date;
    billType: string;
    customerName: string | null;
    customerId: number | null;
    paymentMode: string;
    grandTotal: string;
    paidAmount: string | null;
    operatorName: string | null;
    status: string;
    customerRecordName: string | null;
  }>;
  total: number;
}> {
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const customerIds = await getScopedCustomerIds();

  const conditions = [];
  if (filter.q) {
    const pattern = `%${filter.q}%`;
    conditions.push(
      sql`(
        ${sales.invoiceNo} ilike ${pattern}
        or coalesce(${sales.customerName}, '') ilike ${pattern}
        or coalesce(${customers.name}, '') ilike ${pattern}
        or ${sales.grandTotal}::text like ${pattern}
      )`
    );
  }
  if (filter.billType !== "all") {
    conditions.push(eq(sales.billType, filter.billType));
  }
  const range = filter.day ? istDayRange(filter.day) : null;
  if (range) {
    conditions.push(
      and(
        gte(sales.date, range.from),
        lt(sales.date, range.to)
      )
    );
  }
  if (customerIds !== null) {
    if (customerIds.length === 0) return { rows: [], total: 0 };
    conditions.push(inArray(sales.customerId, customerIds));
  }

  const orderBy =
    filter.sort === "oldest"
      ? asc(sales.date)
      : filter.sort === "amount-desc"
        ? [desc(sales.grandTotal), desc(sales.date)]
        : filter.sort === "amount-asc"
          ? [asc(sales.grandTotal), desc(sales.date)]
          : desc(sales.date);

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const order = Array.isArray(orderBy) ? orderBy : [orderBy];
  const [rows, [{ count }]] = await Promise.all([
    db
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
        status: sales.status,
        customerRecordName: customers.name,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(where)
      .orderBy(...order)
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(where),
  ]);
  return { rows, total: count ?? 0 };
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
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const customerIds = await getScopedCustomerIds();
  if (customerIds !== null && customerIds.length === 0) return [];
  if (
    options?.customerId &&
    customerIds !== null &&
    !customerIds.includes(options.customerId)
  ) {
    return [];
  }

  const q = query.trim();
  const limit = options?.limit ?? 20;
  const filters = [activeSale];

  if (options?.customerId) {
    filters.push(eq(sales.customerId, options.customerId));
  } else if (customerIds !== null) {
    filters.push(inArray(sales.customerId, customerIds));
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
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const customerIds = await getScopedCustomerIds();

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
      roundOff: sales.roundOff,
      paidAmount: sales.paidAmount,
      notes: sales.notes,
      poNumber: sales.poNumber,
      purchaseOrderId: sales.purchaseOrderId,
      quotationNumber: sales.quotationNumber,
      ewayBillNo: sales.ewayBillNo,
      vehicleNo: sales.vehicleNo,
      dispatchedThrough: sales.dispatchedThrough,
      destination: sales.destination,
      deliveryNote: sales.deliveryNote,
      paymentTerms: sales.paymentTerms,
      transporterName: sales.transporterName,
      transporterGstin: sales.transporterGstin,
      distanceKm: sales.distanceKm,
      eInvoiceRequested: sales.eInvoiceRequested,
      status: sales.status,
      cancelledAt: sales.cancelledAt,
      cancelReason: sales.cancelReason,
      einvoiceStatus: sales.einvoiceStatus,
      irn: sales.irn,
      ackNo: sales.ackNo,
      ackDate: sales.ackDate,
      signedQr: sales.signedQr,
      einvoiceError: sales.einvoiceError,
      ewbStatus: sales.ewbStatus,
      ewbId: sales.ewbId,
      ewbNo: sales.ewbNo,
      ewbGeneratedAt: sales.ewbGeneratedAt,
      ewbValidUntil: sales.ewbValidUntil,
      ewbError: sales.ewbError,
      customerRecordName: customers.name,
      customerPhone: customers.phone,
      customerGstin: customers.gstin,
      customerAddress: customers.address,
      customerAcre: customers.acre,
      customerCrop: customers.crop,
      customerPinCode: customers.pinCode,
      customerVillage: customers.village,
      customerTaluk: customers.taluk,
      customerDistrict: customers.district,
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
      return null;
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
      unit: sql<string | null>`coalesce(${saleItems.unit}, ${products.unit})`,
    })
    .from(saleItems)
    .leftJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, id));

  return { ...sale, items };
}

export async function getTodaySalesTotal() {
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const customerIds = await getScopedCustomerIds();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const query = db
    .select({
      total: sql<string>`coalesce(sum(${sales.grandTotal}::numeric), 0)`,
      count: sql<number>`count(*)::int`,
      retail: sql<string>`coalesce(sum(case when ${sales.billType} = 'retail' then ${sales.grandTotal}::numeric else 0 end), 0)`,
      wholesale: sql<string>`coalesce(sum(case when ${sales.billType} = 'wholesale' then ${sales.grandTotal}::numeric else 0 end), 0)`,
      retailCount: sql<number>`count(*) filter (where ${sales.billType} = 'retail')::int`,
      wholesaleCount: sql<number>`count(*) filter (where ${sales.billType} = 'wholesale')::int`,
    })
    .from(sales);

  const baseCondition = and(gte(sales.date, startOfDay), activeSale);

  if (customerIds !== null) {
    if (customerIds.length === 0) {
      return {
        total: 0,
        count: 0,
        retail: 0,
        wholesale: 0,
        retailCount: 0,
        wholesaleCount: 0,
      };
    }
    const [result] = await query.where(and(baseCondition, inArray(sales.customerId, customerIds)));
    return {
      total: parseFloat(result?.total ?? "0"),
      count: result?.count ?? 0,
      retail: parseFloat(result?.retail ?? "0"),
      wholesale: parseFloat(result?.wholesale ?? "0"),
      retailCount: result?.retailCount ?? 0,
      wholesaleCount: result?.wholesaleCount ?? 0,
    };
  }

  const [result] = await query.where(baseCondition);
  return {
    total: parseFloat(result?.total ?? "0"),
    count: result?.count ?? 0,
    retail: parseFloat(result?.retail ?? "0"),
    wholesale: parseFloat(result?.wholesale ?? "0"),
    retailCount: result?.retailCount ?? 0,
    wholesaleCount: result?.wholesaleCount ?? 0,
  };
}

export async function getRecentSales(limit = 5) {
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const customerIds = await getScopedCustomerIds();

  const query = db.select().from(sales);

  if (customerIds !== null) {
    if (customerIds.length === 0) return [];
    return query
      .where(and(inArray(sales.customerId, customerIds), activeSale))
      .orderBy(desc(sales.date))
      .limit(limit);
  }

  return query.where(activeSale).orderBy(desc(sales.date)).limit(limit);
}

export async function getTopSellingProducts(limit = 5) {
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const { inArray } = await import("drizzle-orm");
  const customerIds = await getScopedCustomerIds();

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
      .where(and(inArray(sales.customerId, customerIds), activeSale))
      .groupBy(products.name)
      .orderBy(desc(sql`sum(${saleItems.amount}::numeric)`))
      .limit(limit);
  }

  return query
    .where(activeSale)
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
  cashAmount: number;
  upiAmount: number;
};

export type SalesReportLineItem = {
  invoiceNo: string;
  date: Date;
  billType: string;
  customerName: string;
  customerGstin: string;
  customerState: string;
  paymentMode: string;
  productName: string;
  sku: string;
  category: string;
  batchNumber: string;
  unit: string;
  hsnCode: string;
  qty: number;
  rate: number;
  discountType: string;
  discountValue: number;
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cost: number;
  margin: number;
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
    receivedByMode: Record<string, number>;
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
  const { getScopedCustomerIds } = await import("@/lib/actions/auth");
  const customerIds = await getScopedCustomerIds();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }
  if (fromDate > toDate) {
    throw new Error("From date cannot be after To date.");
  }

  const from = new Date(`${fromDate}T00:00:00+05:30`);
  const to = new Date(`${toDate}T23:59:59.999+05:30`);

  const conditions = [gte(sales.date, from), lte(sales.date, to), activeSale];

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
          receivedByMode: {},
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
      cashAmount: sales.cashAmount,
      upiAmount: sales.upiAmount,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(asc(sales.date), asc(sales.invoiceNo), asc(sales.id));

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
    cashAmount: toNum(row.cashAmount),
    upiAmount: toNum(row.upiAmount),
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
        saleIgst: sales.igst,
        customerGstin: customers.gstin,
        productName: products.name,
        customName: saleItems.customName,
        sku: products.sku,
        category: categories.name,
        unit: products.unit,
        batchNumber: sql<string>`coalesce(${saleItems.batchNumber}, ${productBatches.batchNumber})`,
        batchPurchaseRate: productBatches.purchaseRate,
        productPurchaseRate: products.purchaseRate,
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
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productBatches, eq(saleItems.batchId, productBatches.id))
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(inArray(saleItems.saleId, saleIds))
      .orderBy(asc(sales.date), asc(sales.invoiceNo), asc(saleItems.id));

    const settings = await getSettings();
    lineItems = itemRows.map((row) => {
      const qty = toNum(row.qty);
      const taxableValue = toNum(row.amount);
      const gstRate = toNum(row.gstRate);
      const tax = Math.round((taxableValue * gstRate) / 100 * 100) / 100;
      const interstate = toNum(row.saleIgst) > 0;
      const half = Math.round((tax / 2) * 100) / 100;
      const unitCost =
        toNum(row.batchPurchaseRate) || toNum(row.productPurchaseRate);
      const cost = Math.round(unitCost * qty * 100) / 100;
      return {
        invoiceNo: row.invoiceNo,
        date: row.date,
        billType: row.billType,
        customerName: row.customerRecordName || row.customerName || "Walk-in",
        customerGstin: row.customerGstin || "",
        customerState: stateNameFromGstin(row.customerGstin, settings.state),
        paymentMode: row.paymentMode,
        productName: row.productName || row.customName || "Item",
        sku: row.sku || "",
        category: row.category || "",
        batchNumber: row.batchNumber || "",
        unit: row.unit || "",
        hsnCode: row.hsnCode || "",
        qty,
        rate: toNum(row.rate),
        discountType: row.discountType || "percent",
        discountValue: toNum(row.discountValue),
        gstRate,
        taxableValue,
        cgst: interstate ? 0 : half,
        sgst: interstate ? 0 : Math.round((tax - half) * 100) / 100,
        igst: interstate ? tax : 0,
        cost,
        margin: Math.round((taxableValue - cost) * 100) / 100,
        amount: taxableValue,
        grandTotal: toNum(row.grandTotal),
      };
    });
  }

  const byPaymentMode: Record<string, { count: number; amount: number }> = {};
  const receivedByMode: Record<string, number> = {
    cash: 0,
    upi: 0,
    card: 0,
    cheque: 0,
    credit: 0,
  };
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
    else if (inv.billType === "retail") retailCount++;
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

    // Amounts actually received: prefer cash/upi split; otherwise mode bucket.
    if (inv.cashAmount > 0 || inv.upiAmount > 0) {
      receivedByMode.cash += inv.cashAmount;
      receivedByMode.upi += inv.upiAmount;
      if (mode === "credit") {
        // remainder of paid on credit beyond cash/upi already counted
      }
    } else if (mode === "credit") {
      receivedByMode.credit += inv.paidAmount;
    } else if (mode in receivedByMode) {
      receivedByMode[mode] += inv.paidAmount || inv.grandTotal;
    }
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
      receivedByMode: Object.fromEntries(
        Object.entries(receivedByMode).map(([k, v]) => [k, round2(v)])
      ),
    },
    invoices,
    lineItems,
  };
}

/**
 * Cancel a sales invoice: keep the number, mark it cancelled, add the sold
 * stock back to the batches it came from, and reverse the auto customer
 * receipt. Excluded from all reports/totals thereafter. Admin-only — the
 * caller (lib/actions/sales.ts) enforces the role.
 */
export async function cancelSale(saleId: number, reason: string, actor: string) {
  const {
    safeRevalidatePath: revalidatePath,
    safeRevalidateTag: revalidateTag,
  } = await import("@/lib/revalidate");

  const result = await db.transaction(async (tx) => {
    const [sale] = await tx
      .select({
        id: sales.id,
        invoiceNo: sales.invoiceNo,
        status: sales.status,
        customerId: sales.customerId,
      })
      .from(sales)
      .where(eq(sales.id, saleId))
      .for("update")
      .limit(1);

    if (!sale) throw new Error("Sale not found.");
    if (sale.status === "cancelled") {
      throw new Error(`Invoice ${sale.invoiceNo} is already cancelled.`);
    }

    const [linkedReturn] = await tx
      .select({ id: saleReturns.id })
      .from(saleReturns)
      .where(eq(saleReturns.saleId, saleId))
      .limit(1);
    if (linkedReturn) {
      throw new Error(
        `Invoice ${sale.invoiceNo} has a sales return against it — reverse the return first.`
      );
    }

    const items = await tx
      .select({
        productId: saleItems.productId,
        batchId: saleItems.batchId,
        batchNumber: saleItems.batchNumber,
        qty: saleItems.qty,
      })
      .from(saleItems)
      .where(eq(saleItems.saleId, saleId));

    // Put stock back: per batch where we know it, otherwise just the product.
    const restoredProducts = await restoreSaleStock(
      tx,
      items.map((it) => ({
        productId: it.productId,
        batchId: it.batchId,
        batchNumber: it.batchNumber,
        qty: it.qty,
      })),
      saleId,
      `Cancellation of ${sale.invoiceNo}`
    );

    // Reverse the auto customer receipt (allocations cascade on delete).
    const allocations = await tx
      .select({ paymentId: partyPaymentAllocations.paymentId })
      .from(partyPaymentAllocations)
      .where(eq(partyPaymentAllocations.saleId, saleId));
    const paymentIds = [...new Set(allocations.map((a) => a.paymentId))];
    for (const pid of paymentIds) {
      await tx.delete(partyPayments).where(eq(partyPayments.id, pid));
    }

    await tx
      .update(sales)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: actor,
        cancelReason: reason,
      })
      .where(eq(sales.id, saleId));

    return { invoiceNo: sale.invoiceNo, restoredProducts };
  });

  revalidateTag("sales", "max");
  revalidateTag("products", "max");
  revalidateTag("customers", "max");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${saleId}`);
  revalidatePath("/products");
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/accounts/outstanding");

  return result;
}

export type SaleEditability = { editable: boolean; reasons: string[] };

/** Why an invoice can't be edited right now (empty reasons = editable). */
export async function getSaleEditability(
  saleId: number
): Promise<SaleEditability> {
  const [sale] = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      status: sales.status,
      einvoiceStatus: sales.einvoiceStatus,
      irn: sales.irn,
      ewbStatus: sales.ewbStatus,
      ewbNo: sales.ewbNo,
    })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  if (!sale) return { editable: false, reasons: ["Invoice not found."] };

  const reasons: string[] = [];
  if (sale.status === "cancelled") {
    reasons.push(`Invoice ${sale.invoiceNo} is cancelled.`);
  }
  const [linkedReturn] = await db
    .select({ id: saleReturns.id })
    .from(saleReturns)
    .where(eq(saleReturns.saleId, saleId))
    .limit(1);
  if (linkedReturn) {
    reasons.push(
      `Invoice ${sale.invoiceNo} has a sales return against it — reverse the return first.`
    );
  }
  if (sale.irn && sale.einvoiceStatus === "pushed") {
    reasons.push(
      `Invoice ${sale.invoiceNo} has a pushed IRN — cancel the e-Invoice first.`
    );
  }
  if (sale.ewbNo && sale.ewbStatus === "generated") {
    reasons.push(
      `Invoice ${sale.invoiceNo} has a generated e-way bill — cancel it first.`
    );
  }
  return { editable: reasons.length === 0, reasons };
}

/**
 * Edit a sale: restores the old stock, then re-bills the new lines in the
 * same transaction — same invoice number, date and bill type, fresh totals.
 * Blocked while an IRN is pushed, an e-way bill is generated, a return is
 * linked, or the bill is cancelled (see getSaleEditability).
 */
export async function updateSale(input: UpdateSaleInput) {
  const { safeRevalidatePath: revalidatePath, safeRevalidateTag: revalidateTag } = await import("@/lib/revalidate");
  const data = updateSaleSchema.parse(input);
  const settings = await getSettings();

  if (data.paymentMode === "credit" && !data.customerId) {
    throw new Error("Customer registration required for credit transactions.");
  }

  for (const item of data.items) {
    if (!item.productId && (!item.hsnCode || !item.hsnCode.trim())) {
      throw new Error(
        `HSN code is mandatory for all items on the invoice (${item.customName || "item"}).`
      );
    }
  }

  const normalizedItems = normalizeSaleItems(data.items);
  const productQtyMap = new Map<number, number>();
  for (const item of normalizedItems) {
    if (item.productId) {
      productQtyMap.set(
        item.productId,
        (productQtyMap.get(item.productId) ?? 0) + item.qty
      );
    }
  }
  const productIds = [...productQtyMap.keys()];

  const result = await db.transaction(async (tx) => {
    const [sale] = await tx
      .select()
      .from(sales)
      .where(eq(sales.id, data.saleId))
      .for("update")
      .limit(1);
    if (!sale) throw new Error("Sale not found.");
    if (sale.status === "cancelled") {
      throw new Error(`Invoice ${sale.invoiceNo} is cancelled and cannot be edited.`);
    }

    const [linkedReturn] = await tx
      .select({ id: saleReturns.id })
      .from(saleReturns)
      .where(eq(saleReturns.saleId, data.saleId))
      .limit(1);
    if (linkedReturn) {
      throw new Error(
        `Invoice ${sale.invoiceNo} has a sales return against it — reverse the return first.`
      );
    }
    if (sale.irn && sale.einvoiceStatus === "pushed") {
      throw new Error(
        `Invoice ${sale.invoiceNo} has a pushed IRN — cancel the e-Invoice first.`
      );
    }
    if (sale.ewbNo && sale.ewbStatus === "generated") {
      throw new Error(
        `Invoice ${sale.invoiceNo} has a generated e-way bill — cancel it first.`
      );
    }

    const oldItems = await tx
      .select({
        productId: saleItems.productId,
        batchId: saleItems.batchId,
        batchNumber: saleItems.batchNumber,
        qty: saleItems.qty,
      })
      .from(saleItems)
      .where(eq(saleItems.saleId, data.saleId));
    const oldBalance = Math.max(
      0,
      toNum(sale.grandTotal) - toNum(sale.paidAmount)
    );

    const { finalCustomerId, finalCustomerName } = await resolveSaleCustomer(
      tx,
      data
    );

    let interstate = false;
    if (finalCustomerId) {
      const [cust] = await tx
        .select({ gstin: customers.gstin })
        .from(customers)
        .where(eq(customers.id, finalCustomerId))
        .limit(1);
      interstate = isInterstateGst(cust?.gstin, settings.stateCode);
    }

    const billType = sale.billType as "retail" | "wholesale" | "others";
    const { gst, roundOff, cashAmount, upiAmount, paidAmount } =
      computeSaleSettlement(
        {
          billType,
          paymentMode: data.paymentMode,
          cashAmount: data.cashAmount,
          upiAmount: data.upiAmount,
          paidAmount: data.paidAmount,
          discountAmount: data.discountAmount,
        },
        normalizedItems,
        interstate
      );

    if (data.paymentMode === "credit" && finalCustomerId) {
      await checkCreditLimit(
        tx,
        finalCustomerId,
        gst.grandTotal,
        paidAmount,
        oldBalance
      );
    }

    // Same completion gate as a fresh bill: edits that push a sale into
    // e-invoice/e-way bill eligibility must bring the details along.
    await enforceComplianceDetails(tx, {
      customerId: finalCustomerId,
      customerName: finalCustomerName,
      grandTotal: gst.grandTotal,
      interstate,
      vehicleNo: data.vehicleNo?.trim() || null,
      transporterName: data.transporterName?.trim() || null,
      distanceKm: data.distanceKm ?? null,
    });

    // Restore old stock, drop old lines/movements/receipts, re-bill.
    await restoreSaleStock(
      tx,
      oldItems.map((it) => ({
        productId: it.productId,
        batchId: it.batchId,
        batchNumber: it.batchNumber,
        qty: it.qty,
      })),
      data.saleId,
      `Edit of ${sale.invoiceNo} (restore)`
    );
    await deleteSaleLinesReceiptsAndMovements(tx, data.saleId);

    const productInfo = await lockProductsWithBatches(tx, productIds);
    checkStockAndHsn(productInfo, productQtyMap, normalizedItems);
    const itemDeductions = allocateDeductions(productInfo, normalizedItems);

    await tx
      .update(sales)
      .set({
        customerId: finalCustomerId ?? null,
        customerName: finalCustomerName ?? null,
        paymentMode: data.paymentMode,
        operatorName: data.operatorName ?? settings.defaultOperator,
        subtotal: gst.subtotal.toFixed(2),
        discountAmount: gst.discountAmount.toFixed(2),
        cgst: gst.cgst.toFixed(2),
        sgst: gst.sgst.toFixed(2),
        igst: gst.igst.toFixed(2),
        grandTotal: gst.grandTotal.toFixed(2),
        roundOff: roundOff.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        cashAmount: cashAmount.toFixed(2),
        upiAmount: upiAmount.toFixed(2),
        notes: data.notes ?? null,
        poNumber: data.poNumber?.trim() || null,
        purchaseOrderId: data.purchaseOrderId ?? null,
        quotationNumber: data.quotationNumber?.trim() || null,
        ewayBillNo: data.ewayBillNo?.trim() || null,
        vehicleNo: data.vehicleNo?.trim() || null,
        dispatchedThrough: data.dispatchedThrough?.trim() || null,
        destination: data.destination?.trim() || null,
        deliveryNote: data.deliveryNote?.trim() || null,
        paymentTerms: data.paymentTerms?.trim() || null,
        transporterName: data.transporterName?.trim() || null,
        transporterGstin: data.transporterGstin?.trim().toUpperCase() || null,
        distanceKm:
          data.distanceKm != null ? data.distanceKm.toFixed(1) : null,
        // New totals need a fresh push — a past failure is retryable again.
        einvoiceStatus:
          sale.einvoiceStatus === "failed" ? "none" : sale.einvoiceStatus,
        einvoiceError: sale.einvoiceStatus === "failed" ? null : sale.einvoiceError,
        ewbStatus: sale.ewbStatus === "failed" ? "none" : sale.ewbStatus,
        ewbError: sale.ewbStatus === "failed" ? null : sale.ewbError,
      })
      .where(eq(sales.id, data.saleId));

    await insertSaleItemsAndMovements(
      tx,
      data.saleId,
      normalizedItems,
      itemDeductions
    );
    await applyBatchDeductions(tx, itemDeductions, productIds);
    if (finalCustomerId && paidAmount > 0) {
      await createAutoReceipts(tx, {
        saleId: data.saleId,
        invoiceNo: sale.invoiceNo,
        customerId: finalCustomerId,
        paymentMode: data.paymentMode,
        paidAmount,
        cashAmount,
        upiAmount,
      });
    }

    return { id: data.saleId, invoiceNo: sale.invoiceNo };
  });

  revalidateTag("sales", "max");
  revalidateTag("products", "max");
  revalidateTag("customers", "max");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${data.saleId}`);
  revalidatePath("/products");
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/accounts/outstanding");
  revalidatePath("/accounts/receipts");

  const { scheduleQwicksStockPush } = await import("@/lib/queries/qwicks");
  const oldIds = await db
    .select({ productId: saleItems.productId })
    .from(saleItems)
    .where(eq(saleItems.saleId, data.saleId));
  scheduleQwicksStockPush([
    ...new Set([
      ...productIds,
      ...oldIds.map((r) => r.productId).filter((id): id is number => id != null),
    ]),
  ]);

  return result;
}
