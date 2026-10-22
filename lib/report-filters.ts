import { duplicateHsnKeys, hsnKey } from "@/lib/duplicate-hsn";
import { isValidGstin } from "@/lib/gst";

export const SALES_BILL_TYPES = ["all", "retail", "wholesale", "others"] as const;
export const SALES_PAYMENT_MODES = [
  "all",
  "cash",
  "upi",
  "credit",
  "card",
  "cheque",
  "neft",
] as const;
export const SALES_GST_FILTERS = ["all", "with", "without"] as const;
export const SALES_SETTLEMENTS = ["all", "paid", "partial", "unpaid"] as const;
export const SALES_TAX_SPLITS = ["all", "intra", "inter"] as const;

export type SalesReportFilter = {
  billType: (typeof SALES_BILL_TYPES)[number];
  paymentMode: (typeof SALES_PAYMENT_MODES)[number];
  customer: string;
  gst: (typeof SALES_GST_FILTERS)[number];
  product: string;
  category: string;
  hsn: string;
  operator: string;
  settlement: (typeof SALES_SETTLEMENTS)[number];
  tax: (typeof SALES_TAX_SPLITS)[number];
};

export const emptySalesReportFilter = (): SalesReportFilter => ({
  billType: "all",
  paymentMode: "all",
  customer: "",
  gst: "all",
  product: "",
  category: "",
  hsn: "",
  operator: "",
  settlement: "all",
  tax: "all",
});

export type SalesInvoiceFilterRow = {
  invoiceNo: string;
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

export type SalesLineFilterRow = {
  invoiceNo: string;
  customerGstin: string;
  productName: string;
  sku: string;
  category: string;
  hsnCode: string;
};

export type SalesReportSummary = {
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

function includes(haystack: string, needle: string) {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function settlementOf(paid: number, total: number): SalesReportFilter["settlement"] {
  if (paid <= 0.01) return "unpaid";
  if (paid + 0.01 >= total) return "paid";
  return "partial";
}

function lineMatchesProduct(line: SalesLineFilterRow, filter: SalesReportFilter) {
  const productOk =
    includes(line.productName, filter.product) || includes(line.sku, filter.product);
  return (
    productOk &&
    includes(line.category, filter.category) &&
    includes(hsnKey(line.hsnCode), hsnKey(filter.hsn))
  );
}

function productFilterActive(filter: SalesReportFilter) {
  return Boolean(filter.product.trim() || filter.category.trim() || filter.hsn.trim());
}

export function filterSalesReport<
  I extends SalesInvoiceFilterRow,
  L extends SalesLineFilterRow,
>(
  data: { fromDate: string; toDate: string; invoices: I[]; lineItems: L[] },
  filter: SalesReportFilter
) {
  const linesByInvoice = new Map<string, L[]>();
  for (const line of data.lineItems) {
    const list = linesByInvoice.get(line.invoiceNo) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoiceNo, list);
  }

  const invoices = data.invoices.filter((invoice) => {
    if (filter.billType !== "all" && invoice.billType !== filter.billType) return false;
    if (filter.paymentMode !== "all" && invoice.paymentMode !== filter.paymentMode) {
      return false;
    }
    if (!includes(invoice.customerName, filter.customer)) return false;
    if (!includes(invoice.operatorName, filter.operator)) return false;
    if (
      filter.settlement !== "all" &&
      settlementOf(invoice.paidAmount, invoice.grandTotal) !== filter.settlement
    ) {
      return false;
    }
    if (filter.tax === "inter" && invoice.igst <= 0) return false;
    if (filter.tax === "intra" && invoice.igst > 0) return false;

    const lines = linesByInvoice.get(invoice.invoiceNo) ?? [];
    const gstin = lines.find((line) => line.customerGstin)?.customerGstin ?? "";
    const hasGst = isValidGstin(gstin);
    if (filter.gst === "with" && !hasGst) return false;
    if (filter.gst === "without" && hasGst) return false;
    if (productFilterActive(filter) && !lines.some((line) => lineMatchesProduct(line, filter))) {
      return false;
    }
    return true;
  });

  const kept = new Set(invoices.map((invoice) => invoice.invoiceNo));
  const lineItems = data.lineItems.filter(
    (line) => kept.has(line.invoiceNo) && lineMatchesProduct(line, filter)
  );

  return {
    fromDate: data.fromDate,
    toDate: data.toDate,
    invoices,
    lineItems,
    summary: summarizeSalesInvoices(invoices),
  };
}

export function summarizeSalesInvoices(invoices: SalesInvoiceFilterRow[]): SalesReportSummary {
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
    byPaymentMode[mode].amount = round2(byPaymentMode[mode].amount + inv.grandTotal);

    if (inv.cashAmount > 0 || inv.upiAmount > 0) {
      receivedByMode.cash += inv.cashAmount;
      receivedByMode.upi += inv.upiAmount;
    } else if (mode === "credit") {
      receivedByMode.credit += inv.paidAmount;
    } else if (mode in receivedByMode) {
      receivedByMode[mode] += inv.paidAmount || inv.grandTotal;
    }
  }

  return {
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
      Object.entries(receivedByMode).map(([key, value]) => [key, round2(value)])
    ),
  };
}

export const STOCK_STATUSES = ["all", "active", "inactive"] as const;
export const STOCK_LEVELS = ["all", "in", "out", "low"] as const;
export const STOCK_EXPIRY = ["all", "dated", "none", "expired", "soon"] as const;
export const STOCK_SOLD = ["all", "sold", "unsold"] as const;
export const STOCK_DUPLICATES = ["all", "only"] as const;

export type StockReportFilter = {
  q: string;
  category: string;
  status: (typeof STOCK_STATUSES)[number];
  stock: (typeof STOCK_LEVELS)[number];
  hsn: string;
  gstRate: string;
  duplicates: (typeof STOCK_DUPLICATES)[number];
  expiry: (typeof STOCK_EXPIRY)[number];
  sold: (typeof STOCK_SOLD)[number];
};

export const emptyStockReportFilter = (): StockReportFilter => ({
  q: "",
  category: "",
  status: "all",
  stock: "all",
  hsn: "",
  gstRate: "",
  duplicates: "all",
  expiry: "all",
  sold: "all",
});

export type StockFilterRow = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  stockQty: number;
  reorderLevel: number;
  hsnCode: string;
  gstRate: number;
  expiryDate: string;
  status: string;
  qtySold?: number;
};

const SOON_DAYS = 90;

function expiryState(value: string, today: string): "none" | "expired" | "soon" | "dated" {
  const date = value.trim();
  if (!date) return "none";
  if (date < today) return "expired";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + SOON_DAYS);
  const limitKey = limit.toISOString().slice(0, 10);
  if (date <= limitKey) return "soon";
  return "dated";
}

export function filterStockRows<T extends StockFilterRow>(
  rows: T[],
  filter: StockReportFilter,
  today = new Date().toISOString().slice(0, 10)
) {
  const duplicates = duplicateHsnKeys(rows.map((row) => row.hsnCode));
  const gst = filter.gstRate.trim();
  const gstNumber = gst === "" ? null : Number(gst);

  return rows.filter((row) => {
    const text = `${row.name} ${row.sku} ${row.barcode}`;
    if (!includes(text, filter.q)) return false;
    if (!includes(row.category, filter.category)) return false;
    if (filter.status !== "all" && row.status.toLowerCase() !== filter.status) return false;
    if (filter.stock === "in" && row.stockQty <= 0) return false;
    if (filter.stock === "out" && row.stockQty > 0) return false;
    if (filter.stock === "low" && row.stockQty >= row.reorderLevel) return false;
    if (!includes(hsnKey(row.hsnCode), hsnKey(filter.hsn))) return false;
    if (
      gstNumber !== null &&
      (!Number.isFinite(gstNumber) || Math.abs(row.gstRate - gstNumber) > 0.001)
    ) {
      return false;
    }
    if (filter.duplicates === "only" && !duplicates.has(hsnKey(row.hsnCode))) return false;
    const expiry = expiryState(row.expiryDate, today);
    if (filter.expiry === "dated" && expiry === "none") return false;
    if (filter.expiry === "none" && expiry !== "none") return false;
    if (filter.expiry === "expired" && expiry !== "expired") return false;
    if (filter.expiry === "soon" && expiry !== "soon") return false;
    const sold = row.qtySold ?? 0;
    if (filter.sold === "sold" && sold <= 0) return false;
    if (filter.sold === "unsold" && sold > 0) return false;
    return true;
  });
}

export const MOVEMENT_TYPES = ["all", "purchase", "sale", "adjustment", "return"] as const;
export const MOVEMENT_DIRECTIONS = ["all", "in", "out"] as const;

export type StockMovementFilter = {
  q: string;
  type: (typeof MOVEMENT_TYPES)[number];
  direction: (typeof MOVEMENT_DIRECTIONS)[number];
};

export const emptyStockMovementFilter = (): StockMovementFilter => ({
  q: "",
  type: "all",
  direction: "all",
});

export type StockMovementFilterRow = {
  productName: string;
  sku: string | null;
  type: string;
  qtyDelta: number;
};

export function filterStockMovements<T extends StockMovementFilterRow>(
  rows: T[],
  filter: StockMovementFilter
) {
  return rows.filter((row) => {
    if (filter.type !== "all" && row.type !== filter.type) return false;
    if (filter.direction === "in" && row.qtyDelta < 0) return false;
    if (filter.direction === "out" && row.qtyDelta >= 0) return false;
    return includes(`${row.productName} ${row.sku ?? ""}`, filter.q);
  });
}

export function summarizeStockMovements(rows: StockMovementFilterRow[]) {
  let qtyIn = 0;
  let qtyOut = 0;
  for (const row of rows) {
    if (row.qtyDelta >= 0) qtyIn += row.qtyDelta;
    else qtyOut += Math.abs(row.qtyDelta);
  }
  return {
    movementCount: rows.length,
    qtyIn: round2(qtyIn),
    qtyOut: round2(qtyOut),
  };
}
