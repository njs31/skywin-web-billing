import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  displayPaymentVoucherNo,
  formatReceiptVoucherNo,
  getIndianFinancialYearBounds,
} from "./financial-year";

describe("receipt voucher numbering", () => {
  it("formats RCP/0001/26-27", () => {
    assert.equal(formatReceiptVoucherNo(1, "26-27"), "RCP/0001/26-27");
    assert.equal(formatReceiptVoucherNo(42, "26-27"), "RCP/0042/26-27");
  });

  it("rolls the FY label at 1 April", () => {
    const march = getIndianFinancialYearBounds(new Date(2026, 2, 31));
    const april = getIndianFinancialYearBounds(new Date(2026, 3, 1));
    assert.equal(march.shortLabel, "25-26");
    assert.equal(april.shortLabel, "26-27");
    assert.notEqual(
      formatReceiptVoucherNo(1, march.shortLabel),
      formatReceiptVoucherNo(1, april.shortLabel)
    );
  });

  it("falls back to RCP-{id} for legacy rows", () => {
    assert.equal(
      displayPaymentVoucherNo({ type: "receipt", id: 17, voucherNo: null }),
      "RCP-17"
    );
    assert.equal(
      displayPaymentVoucherNo({
        type: "receipt",
        id: 17,
        voucherNo: "RCP/0003/26-27",
      }),
      "RCP/0003/26-27"
    );
  });
});
