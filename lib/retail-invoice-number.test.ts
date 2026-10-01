import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatRetailInvoiceNo,
  isIrpCompatibleDocNo,
  assertRetailInvoiceNo,
  retailInvoiceDayStamp,
  RETAIL_INVOICE_PREFIX,
} from "./financial-year";

describe("retail invoice numbering (IRP-compatible)", () => {
  it("stamps the day as YYMMDD", () => {
    assert.equal(retailInvoiceDayStamp(new Date(2026, 9, 1)), "261001");
    assert.equal(retailInvoiceDayStamp(new Date(2026, 0, 5)), "260105");
  });

  it("formats INV-YYMMDD-NNNN with zero-padded sequence", () => {
    assert.equal(formatRetailInvoiceNo("INV", "261001", 1), "INV-261001-0001");
    assert.equal(formatRetailInvoiceNo("INV", "261001", 2), "INV-261001-0002");
    assert.equal(formatRetailInvoiceNo("INV", "261001", 538), "INV-261001-0538");
  });

  it("lets the sequence grow past 4 digits without padding tricks", () => {
    assert.equal(
      formatRetailInvoiceNo("INV", "261001", 12345),
      "INV-261001-12345"
    );
  });

  it("rejects non-positive or fractional sequences", () => {
    assert.throws(() => formatRetailInvoiceNo("INV", "261001", 0), /sequence/);
    assert.throws(() => formatRetailInvoiceNo("INV", "261001", 1.5), /sequence/);
  });

  it("stays within the 16-char IRP ceiling for realistic volumes", () => {
    for (const seq of [1, 538, 9999, 10000, 99999]) {
      const no = formatRetailInvoiceNo(RETAIL_INVOICE_PREFIX, "261001", seq);
      assert.ok(no.length <= 16, `${no} is ${no.length} chars`);
      assert.ok(isIrpCompatibleDocNo(no));
    }
  });

  it("never collides with the old INV-YYYYMMDD-NNNN shape", () => {
    // Old rows carry an 8-digit stamp; the new LIKE scope pins the 6-digit
    // stamp, so neither pattern can match the other's rows.
    const oldNo = "INV-20260903-0538";
    assert.ok(!oldNo.includes("-261001-"));
    assert.ok(!isIrpCompatibleDocNo(oldNo));
  });
});

describe("isIrpCompatibleDocNo (official NIC pattern)", () => {
  const valid = [
    "INV-261001-0001",
    "INV-261001-0538",
    "SKYA/0409/26-27",
    "R/1234",
    "1234567890123456", // 16 chars, leading 1-9 allowed
    "A",
  ];
  for (const no of valid) {
    it(`accepts ${no}`, () => {
      assert.equal(isIrpCompatibleDocNo(no), true);
    });
  }

  const invalid: Array<[string, string]> = [
    ["INV-20260903-0538", "17 chars (old retail format)"],
    ["", "empty"],
    ["0ABC", "leading zero"],
    ["/ABC", "leading slash"],
    ["-ABC", "leading dash"],
    ["INV 261001 0001", "spaces"],
    ["INV_261001_0001", "underscores"],
  ];
  for (const [no, why] of invalid) {
    it(`rejects ${why}: ${no || "(empty)"}`, () => {
      assert.equal(isIrpCompatibleDocNo(no), false);
      assert.throws(() => assertRetailInvoiceNo(no), /IRP-compatible/);
    });
  }
});
