import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocateDeductions,
  computeSaleSettlement,
  normalizeSaleItems,
  type NormalizedSaleItem,
  type ProductStockInfo,
} from "./sales";

function info(
  batches: Array<{ batchId: number; batchNumber: string; qty: number }>
): ProductStockInfo {
  return {
    name: "Test Product",
    hsnCode: "12345678",
    batches: batches.map((b) => ({ ...b, expiryDate: null })),
  };
}

function line(overrides: Partial<NormalizedSaleItem> = {}): NormalizedSaleItem {
  return {
    productId: 1,
    qty: 2,
    rate: 100,
    gstRate: 18,
    discountType: "percent",
    discountValue: 0,
    ...overrides,
  };
}

describe("normalizeSaleItems", () => {
  it("folds percent discounts into discountValue", () => {
    const [a, b] = normalizeSaleItems([
      { ...line(), discountPercent: 10, discountValue: 0 },
      { ...line(), discountType: "value", discountValue: 25 },
    ]);
    assert.equal(a.discountValue, 10);
    assert.equal(b.discountValue, 25);
  });
});

describe("computeSaleSettlement", () => {
  const base = {
    billType: "retail" as const,
    paymentMode: "cash" as const,
    discountAmount: 0,
  };

  it("matches counter checkout math on a plain cash bill", () => {
    const s = computeSaleSettlement({ ...base }, [line()], false);
    // 2 × 100 = 200 taxable, 18% GST = 36, total 236.
    assert.equal(s.gst.subtotal, 200);
    assert.equal(s.gst.grandTotal, 236);
    assert.equal(s.paidAmount, 236);
    assert.equal(s.cashAmount, 236);
  });

  it("charges IGST instead of CGST/SGST interstate", () => {
    const s = computeSaleSettlement({ ...base }, [line()], true);
    assert.equal(s.gst.igst, 36);
    assert.equal(s.gst.cgst, 0);
    assert.equal(s.gst.sgst, 0);
  });

  it("leaves credit bills unpaid by default", () => {
    const s = computeSaleSettlement(
      { ...base, paymentMode: "credit" },
      [line()],
      false
    );
    assert.equal(s.paidAmount, 0);
  });

  it("refuses an underpaid non-credit bill", () => {
    assert.throws(
      () =>
        computeSaleSettlement(
          {
            billType: "wholesale",
            paymentMode: "cash",
            paidAmount: 100,
            cashAmount: 100,
          },
          [line()],
          false
        ),
      /Payment incomplete/
    );
  });
});

describe("allocateDeductions", () => {
  it("drains earliest batches first (FEFO)", () => {
    const productInfo = new Map([[1, info([
      { batchId: 10, batchNumber: "B1", qty: 3 },
      { batchId: 11, batchNumber: "B2", qty: 5 },
    ])]]);
    const [deductions] = allocateDeductions(productInfo, [line({ qty: 4 })]);
    assert.deepEqual(deductions, [
      { batchId: 10, batchNumber: "B1", qty: 3 },
      { batchId: 11, batchNumber: "B2", qty: 1 },
    ]);
  });

  it("pins to the requested batch when it covers the qty", () => {
    const productInfo = new Map([[1, info([
      { batchId: 10, batchNumber: "B1", qty: 10 },
      { batchId: 11, batchNumber: "B2", qty: 10 },
    ])]]);
    const [deductions] = allocateDeductions(productInfo, [
      line({ qty: 2, batchId: 11 }),
    ]);
    assert.deepEqual(deductions, [{ batchId: 11, batchNumber: "B2", qty: 2 }]);
  });

  it("throws when stock runs out mid-allocation", () => {
    const productInfo = new Map([[1, info([
      { batchId: 10, batchNumber: "B1", qty: 1 },
    ])]]);
    assert.throws(
      () => allocateDeductions(productInfo, [line({ qty: 5 })]),
      /Insufficient stock/
    );
  });

  it("skips custom (non-inventory) lines", () => {
    const productInfo = new Map<number, ProductStockInfo>();
    const [deductions] = allocateDeductions(productInfo, [
      line({ productId: null }),
    ]);
    assert.deepEqual(deductions, []);
  });
});
