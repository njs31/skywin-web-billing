import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculatePurchaseTotals, handlingAmountFor } from "./purchase-totals";

describe("calculatePurchaseTotals", () => {
  it("keeps CGST and SGST equal and the totals equal to the HSN rows", () => {
    // Three lines at 18% whose per-line rounding used to drift the HSN table
    // away from the totals box by a paisa or more.
    const t = calculatePurchaseTotals({
      interstate: false,
      lines: [
        { qty: 3, rate: 111.17, gstRate: 18, hsnCode: "3808" },
        { qty: 7, rate: 43.33, gstRate: 18, hsnCode: "3808" },
        { qty: 1, rate: 999.99, gstRate: 5, hsnCode: "3101" },
      ],
    });
    assert.equal(t.cgst, t.sgst);
    const rowCgst = Math.round(t.rows.reduce((s, r) => s + r.cgst, 0) * 100) / 100;
    assert.equal(t.cgst, rowCgst);
    assert.equal(t.gstTotal, Math.round((t.cgst + t.sgst) * 100) / 100);
    // 3808 @18: taxable 333.51 + 303.31 = 636.82 -> 9% = 57.31 (57.3138)
    const r18 = t.rows.find((r) => r.hsn === "3808")!;
    assert.equal(r18.taxable, 636.82);
    assert.equal(r18.cgst, 57.31);
  });

  it("puts all tax in IGST for an interstate supplier", () => {
    const t = calculatePurchaseTotals({
      interstate: true,
      lines: [{ qty: 2, rate: 500, gstRate: 12, hsnCode: "8424" }],
    });
    assert.equal(t.cgst, 0);
    assert.equal(t.sgst, 0);
    assert.equal(t.igst, 120);
  });

  it("rounds the grand total to the nearest rupee and records the delta", () => {
    const t = calculatePurchaseTotals({
      interstate: false,
      lines: [{ qty: 1, rate: 100.3, gstRate: 0, hsnCode: "1" }],
    });
    assert.equal(t.exactTotal, 100.3);
    assert.equal(t.grandTotal, 100);
    assert.equal(t.roundOff, -0.3);

    const up = calculatePurchaseTotals({
      interstate: false,
      lines: [{ qty: 1, rate: 100.5, gstRate: 0, hsnCode: "1" }],
    });
    assert.equal(up.grandTotal, 101);
    assert.equal(up.roundOff, 0.5);
  });

  it("charges GST on handling as its own row", () => {
    const t = calculatePurchaseTotals({
      interstate: false,
      lines: [{ qty: 10, rate: 100, gstRate: 5, hsnCode: "3101" }],
      handlingType: "value",
      handlingValue: 200,
      handlingGstRate: 18,
    });
    assert.equal(t.handlingAmount, 200);
    assert.equal(t.handlingGst, 36);
    // items 1000 @5% = 50, handling 200 @18% = 36
    assert.equal(t.gstTotal, 86);
    assert.equal(t.grandTotal, 1286);
    const h = t.rows.find((r) => r.isHandling)!;
    assert.equal(h.cgst, 18);
    assert.equal(h.sgst, 18);
  });

  it("works out percentage handling from the items' taxable value", () => {
    const t = calculatePurchaseTotals({
      interstate: false,
      lines: [{ qty: 4, rate: 250, gstRate: 0, hsnCode: "1", discountType: "percent", discountValue: 10 }],
      handlingType: "percent",
      handlingValue: 2.5,
      handlingGstRate: 0,
    });
    // taxable 900, 2.5% = 22.50
    assert.equal(t.subtotal, 900);
    assert.equal(t.handlingAmount, 22.5);
    assert.equal(t.handlingGst, 0);
    assert.equal(t.grandTotal, 923);
  });

  it("adds no handling row when there is no handling", () => {
    const t = calculatePurchaseTotals({
      interstate: false,
      lines: [{ qty: 1, rate: 10, gstRate: 18, hsnCode: "1" }],
    });
    assert.equal(t.rows.some((r) => r.isHandling), false);
  });
});

describe("handlingAmountFor", () => {
  it("ignores negative and non-numeric input", () => {
    assert.equal(handlingAmountFor(1000, "value", -5), 0);
    assert.equal(handlingAmountFor(1000, "percent", Number.NaN), 0);
  });
});
