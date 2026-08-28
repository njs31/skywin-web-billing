import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatWholesaleInvoiceNo,
  nextWholesaleSequence,
  WHOLESALE_INVOICE_SEQ_FLOOR,
} from "./financial-year";
import { getBatchBillingRate, inclusiveSalePrice, normalizeCartQty } from "./gst";
import {
  buildAutoReceiptParts,
  compareSalesReportRows,
  invoiceSettlement,
  sortPaymentModeEntries,
} from "./sale-settlement";

describe("wholesale invoice series SKYA/0379/26-27", () => {
  it("starts the next number at 379 when no wholesale invoices exist", () => {
    assert.equal(nextWholesaleSequence(0), 379);
    assert.equal(WHOLESALE_INVOICE_SEQ_FLOOR, 378);
    assert.equal(
      formatWholesaleInvoiceNo(nextWholesaleSequence(0), "26-27"),
      "SKYA/0379/26-27"
    );
  });

  it("continues after an existing higher sequence", () => {
    assert.equal(nextWholesaleSequence(400), 401);
    assert.equal(
      formatWholesaleInvoiceNo(401, "26-27"),
      "SKYA/0401/26-27"
    );
  });
});

describe("batch-wise sale rate", () => {
  it("uses the batch sale rate for retail/sale entry", () => {
    assert.equal(
      getBatchBillingRate(
        { saleRate: "100", wholesaleRate: "80", batchSaleRate: "125.50" },
        "sale"
      ),
      125.5
    );
  });

  it("falls back to the product sale rate when the batch has no rate", () => {
    assert.equal(
      getBatchBillingRate(
        { saleRate: "100", wholesaleRate: "80", batchSaleRate: null },
        "sale"
      ),
      100
    );
  });

  it("prefers wholesale rate in wholesale billing", () => {
    assert.equal(
      getBatchBillingRate(
        { saleRate: "100", wholesaleRate: "80", batchSaleRate: "125" },
        "wholesale"
      ),
      80
    );
  });
});

describe("auto credit entries for cash/card/UPI", () => {
  it("does not create receipts for credit sales", () => {
    assert.deepEqual(
      buildAutoReceiptParts({
        paymentMode: "credit",
        paidAmount: 0,
        cashAmount: 0,
        upiAmount: 0,
      }),
      []
    );
  });

  it("credits cash, card, and UPI automatically", () => {
    assert.deepEqual(
      buildAutoReceiptParts({
        paymentMode: "cash",
        paidAmount: 118,
        cashAmount: 118,
        upiAmount: 0,
      }),
      [{ paymentMode: "cash", amount: 118 }]
    );
    assert.deepEqual(
      buildAutoReceiptParts({
        paymentMode: "upi",
        paidAmount: 200,
        cashAmount: 0,
        upiAmount: 0,
      }),
      [{ paymentMode: "upi", amount: 200 }]
    );
    assert.deepEqual(
      buildAutoReceiptParts({
        paymentMode: "card",
        paidAmount: 500,
        cashAmount: 0,
        upiAmount: 0,
      }),
      [{ paymentMode: "card", amount: 500 }]
    );
  });

  it("splits cash + UPI into two credit entries", () => {
    assert.deepEqual(
      buildAutoReceiptParts({
        paymentMode: "cash",
        paidAmount: 100,
        cashAmount: 40,
        upiAmount: 60,
      }),
      [
        { paymentMode: "cash", amount: 40 },
        { paymentMode: "upi", amount: 60 },
      ]
    );
  });

  it("prints received and nil balance on cash invoices", () => {
    const s = invoiceSettlement({
      paymentMode: "upi",
      grandTotal: 118,
      paidAmount: 118,
      cashAmount: 0,
      upiAmount: 118,
    });
    assert.equal(s.received, 118);
    assert.equal(s.balance, 0);
    assert.equal(s.label, "UPI");
  });
});

describe("sales report ascending order", () => {
  it("sorts oldest invoice first, then invoice number", () => {
    const rows = [
      { date: "2026-08-20T10:00:00Z", invoiceNo: "SKYA/0380/26-27", id: 2 },
      { date: "2026-08-19T10:00:00Z", invoiceNo: "SKYA/0379/26-27", id: 1 },
      { date: "2026-08-20T10:00:00Z", invoiceNo: "SKYA/0381/26-27", id: 3 },
    ];
    const sorted = [...rows].sort(compareSalesReportRows);
    assert.deepEqual(
      sorted.map((r) => r.invoiceNo),
      ["SKYA/0379/26-27", "SKYA/0380/26-27", "SKYA/0381/26-27"]
    );
  });

  it("orders payment mode summary cash → UPI → card → cheque → credit", () => {
    const sorted = sortPaymentModeEntries([
      ["credit", 1],
      ["upi", 2],
      ["cash", 3],
      ["card", 4],
    ]);
    assert.deepEqual(
      sorted.map(([mode]) => mode),
      ["cash", "upi", "card", "credit"]
    );
  });
});

describe("Qwicks API GST-inclusive price", () => {
  it("adds GST to sale price for Qwicks payload", () => {
    assert.equal(inclusiveSalePrice(100, 12), 112);
    assert.equal(inclusiveSalePrice(47.87, 12), 53.61);
  });

  it("leaves exempt products unchanged", () => {
    assert.equal(inclusiveSalePrice(80, 0), 80);
  });
});

describe("POS editable quantity", () => {
  it("accepts large typed quantities within stock", () => {
    assert.equal(normalizeCartQty(1000, 5000, true), 1000);
  });

  it("rejects quantity above available stock", () => {
    assert.equal(normalizeCartQty(1000, 50, true), null);
  });

  it("rejects zero or invalid input", () => {
    assert.equal(normalizeCartQty(0, 100, true), null);
    assert.equal(normalizeCartQty(-5, 100, true), null);
  });
});
