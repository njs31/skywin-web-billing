import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateGstBreakdown, applyRupeeRounding, calculateLineAmount } from "./gst";
import {
  lineBasic,
  lineFinalAmount,
  lineFinalRate,
  lineGstLabel,
  wholesaleDiscountColumns,
} from "./invoice-line-display";

// Lines from INV-20261105-2700 (5 Nov 2026, PANDIAN FARMER), as saved.
const INV_2700 = [
  { qty: "3.00", rate: "1799.05", amount: "4857.43", gstRate: "5.00", basic: 1889.0 },
  { qty: "1.00", rate: "979.05", amount: "881.15", gstRate: "5.00", basic: 1028.0 },
  { qty: "1.00", rate: "714.31", amount: "642.88", gstRate: "5.00", basic: 750.03 },
  { qty: "1.00", rate: "502.62", amount: "452.36", gstRate: "5.00", basic: 527.75 },
  { qty: "1.00", rate: "397.17", amount: "357.45", gstRate: "5.00", basic: 417.03 },
  { qty: "1.00", rate: "1296.75", amount: "1167.08", gstRate: "5.00", basic: 1361.59 },
  { qty: "1.00", rate: "2539.29", amount: "2285.36", gstRate: "5.00", basic: 2666.25 },
].map((l) => ({ ...l, discountType: "percent", discountValue: "10.00", discountPercent: "10.00" }));

describe("invoice line display (Basic / GST / final Amount)", () => {
  it("Basic is the old bracket value for every INV-20261105-2700 line", () => {
    for (const line of INV_2700) assert.equal(lineBasic(line), line.basic);
  });

  it("GST column shows only the percentage", () => {
    assert.equal(lineGstLabel({ gstRate: "5.00" }), "5%");
    assert.equal(lineGstLabel({ gstRate: "18" }), "18%");
    assert.equal(lineGstLabel({ gstRate: "0" }), "0%");
    assert.equal(lineGstLabel({ gstRate: "2.5" }), "2.5%");
  });

  it("Amount is the discounted line plus GST", () => {
    assert.equal(lineFinalAmount(INV_2700[0]), 5100.3);
    assert.equal(lineFinalAmount(INV_2700[1]), 925.21);
    assert.equal(lineFinalRate(INV_2700[0]), 1700.1);
    assert.equal(lineFinalAmount({ amount: "100", gstRate: "0" }), 100);
    // No discount: Final Rate equals the MRP (Basic), not a paisa above it.
    const plain = { qty: "20", rate: "321.36", amount: "6427.20", gstRate: "18" };
    assert.equal(lineFinalRate(plain), lineBasic(plain));
  });

  it("the bill still totals ₹11,176.00 — display change only", () => {
    const gst = applyRupeeRounding(
      calculateGstBreakdown(
        INV_2700.map((l) => ({
          qty: Number(l.qty),
          rate: Number(l.rate),
          gstRate: Number(l.gstRate),
          discountType: "percent" as const,
          discountValue: 10,
        }))
      )
    );
    assert.equal(gst.taxableAmount, 10643.71);
    assert.equal(gst.cgst, 266.1);
    assert.equal(gst.sgst, 266.1);
    assert.equal(gst.roundOff, 0.09);
    assert.equal(gst.grandTotal, 11176);
    // Sum of the printed final amounts lands within paise of the bill.
    const finals = INV_2700.reduce((s, l) => s + lineFinalAmount(l), 0);
    assert.ok(Math.abs(finals - (10643.71 + 266.1 + 266.1)) < 0.05);
  });
});

describe("wholesale discount: percent or rupees", () => {
  it("a % discount takes that percent off qty × rate", () => {
    assert.equal(calculateLineAmount(10, 200, 10, "percent"), 1800);
  });

  it("a ₹ amount takes exactly that amount off the line", () => {
    assert.equal(calculateLineAmount(10, 200, 150, "value"), 1850);
    assert.equal(calculateLineAmount(3, 99.99, 0.97, "value"), 299);
  });

  it("no discount (price-based deal) leaves the line at qty × rate", () => {
    assert.equal(calculateLineAmount(10, 180, 0, "percent"), 1800);
    assert.equal(calculateLineAmount(10, 180, 0, "value"), 1800);
  });

  it("shows % and the rupees it took off when entered as a percent", () => {
    assert.deepEqual(
      wholesaleDiscountColumns({
        qty: "10", rate: "200", amount: "1800", discountType: "percent",
        discountValue: "10", discountPercent: "10",
      }),
      { percent: "10%", amount: "200.00" }
    );
  });

  it("shows 0% and the amount when entered in rupees", () => {
    assert.deepEqual(
      wholesaleDiscountColumns({
        qty: "10", rate: "200", amount: "1850", discountType: "value",
        discountValue: "150", discountPercent: "0",
      }),
      { percent: "0", amount: "150.00" }
    );
  });

  it("shows 0 in both columns when the price is the discount", () => {
    assert.deepEqual(
      wholesaleDiscountColumns({
        qty: "10", rate: "180", amount: "1800", discountType: "percent",
        discountValue: "0", discountPercent: "0",
      }),
      { percent: "0", amount: "0" }
    );
  });

  it("old invoices with only discount_percent still read correctly", () => {
    assert.deepEqual(
      wholesaleDiscountColumns({
        qty: "2", rate: "500", amount: "950", discountPercent: "5",
      }),
      { percent: "5%", amount: "50.00" }
    );
  });
});
