import assert from "node:assert/strict";
import test from "node:test";
import {
  emptySalesReportFilter,
  emptyStockReportFilter,
  filterSalesReport,
  filterStockMovements,
  filterStockRows,
  type SalesInvoiceFilterRow,
  type SalesLineFilterRow,
  type StockFilterRow,
} from "./report-filters";

const GST = "33AABCU9603R1ZM";

function invoice(overrides: Partial<SalesInvoiceFilterRow> = {}): SalesInvoiceFilterRow {
  return {
    invoiceNo: "INV-1",
    billType: "retail",
    customerName: "Ajay",
    paymentMode: "cash",
    operatorName: "Ravi",
    subtotal: 100,
    discountAmount: 0,
    cgst: 9,
    sgst: 9,
    igst: 0,
    grandTotal: 118,
    paidAmount: 118,
    cashAmount: 118,
    upiAmount: 0,
    ...overrides,
  };
}

function line(overrides: Partial<SalesLineFilterRow> = {}): SalesLineFilterRow {
  return {
    invoiceNo: "INV-1",
    customerGstin: "",
    productName: "Paddy weeder",
    sku: "10000921",
    category: "Tools",
    hsnCode: "8432",
    ...overrides,
  };
}

function stock(overrides: Partial<StockFilterRow> = {}): StockFilterRow {
  return {
    name: "Paddy weeder",
    sku: "10000921",
    barcode: "SW000921",
    category: "Tools",
    stockQty: 4,
    reorderLevel: 2,
    hsnCode: "8432",
    gstRate: 18,
    expiryDate: "",
    status: "Active",
    qtySold: 1,
    ...overrides,
  };
}

test("sales filters keep a credit GST bill and its matching product line", () => {
  const data = {
    fromDate: "2026-10-01",
    toDate: "2026-10-17",
    invoices: [
      invoice({ invoiceNo: "INV-1", paymentMode: "credit", paidAmount: 0, cashAmount: 0 }),
      invoice({ invoiceNo: "INV-2", customerName: "Walk-in", paymentMode: "upi" }),
    ],
    lineItems: [
      line({ invoiceNo: "INV-1", customerGstin: GST, productName: "Weeder" }),
      line({ invoiceNo: "INV-1", customerGstin: GST, productName: "Oil", sku: "200" }),
      line({ invoiceNo: "INV-2", productName: "Weeder" }),
    ],
  };
  const filtered = filterSalesReport(data, {
    ...emptySalesReportFilter(),
    paymentMode: "credit",
    gst: "with",
    product: "weed",
  });
  assert.deepEqual(
    filtered.invoices.map((row) => row.invoiceNo),
    ["INV-1"]
  );
  assert.deepEqual(
    filtered.lineItems.map((row) => row.productName),
    ["Weeder"]
  );
  assert.equal(filtered.summary.billCount, 1);
  assert.equal(filtered.summary.paidAmount, 0);
});

test("unpaid and interstate filters drop settled local bills", () => {
  const data = {
    fromDate: "2026-10-01",
    toDate: "2026-10-17",
    invoices: [
      invoice(),
      invoice({
        invoiceNo: "INV-2",
        igst: 18,
        cgst: 0,
        sgst: 0,
        paidAmount: 0,
        cashAmount: 0,
        paymentMode: "credit",
      }),
    ],
    lineItems: [line(), line({ invoiceNo: "INV-2" })],
  };
  const filtered = filterSalesReport(data, {
    ...emptySalesReportFilter(),
    settlement: "unpaid",
    tax: "inter",
  });
  assert.deepEqual(
    filtered.invoices.map((row) => row.invoiceNo),
    ["INV-2"]
  );
});

test("stock filters combine level, expiry, duplicate HSN, and sales", () => {
  const rows = [
    stock({ name: "A", hsnCode: "8432", stockQty: 1, reorderLevel: 5, expiryDate: "2026-01-01" }),
    stock({ name: "B", sku: "2", hsnCode: "8432", stockQty: 9, expiryDate: "2026-12-01", qtySold: 0 }),
    stock({ name: "C", hsnCode: "1001", stockQty: 0, status: "Inactive" }),
  ];
  const lowExpired = filterStockRows(
    rows,
    { ...emptyStockReportFilter(), stock: "low", expiry: "expired", duplicates: "only" },
    "2026-10-22"
  );
  assert.deepEqual(
    lowExpired.map((row) => row.name),
    ["A"]
  );
  const unsold = filterStockRows(rows, { ...emptyStockReportFilter(), sold: "unsold" }, "2026-10-22");
  assert.deepEqual(
    unsold.map((row) => row.name),
    ["B"]
  );
});

test("stock movement filters keep outward sales of one product", () => {
  const rows = filterStockMovements(
    [
      { productName: "Weeder", sku: "1", type: "sale", qtyDelta: -2 },
      { productName: "Weeder", sku: "1", type: "purchase", qtyDelta: 10 },
      { productName: "Oil", sku: "2", type: "sale", qtyDelta: -1 },
    ],
    { q: "weed", type: "sale", direction: "out" }
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.qtyDelta, -2);
});
