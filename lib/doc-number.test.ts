import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isIrpCompatibleDocNo } from "./financial-year";

/**
 * The NIC document-number rule shared by billing (never emit) and the
 * e-invoice mapper (never submit): String(16),
 * ^([a-zA-Z1-9]{1}[a-zA-Z0-9/-]{0,15})$.
 */
describe("isIrpCompatibleDocNo (official NIC pattern)", () => {
  const valid = [
    "SKYA/0409/26-27",
    "R/1234",
    "INV-261001-0001",
    "1234567890123456",
    "A",
  ];
  for (const no of valid) {
    it(`accepts ${no}`, () => {
      assert.equal(isIrpCompatibleDocNo(no), true);
    });
  }

  const invalid: Array<[string, string]> = [
    ["INV-20260903-0538", "17 chars (retail series — B2C only)"],
    ["", "empty"],
    ["0ABC", "leading zero"],
    ["/ABC", "leading slash"],
    ["-ABC", "leading dash"],
    ["INV 261001 0001", "spaces"],
    ["INV_261001_0001", "underscores"],
  ];
  for (const [no, why] of invalid) {
    it(`rejects ${why}`, () => {
      assert.equal(isIrpCompatibleDocNo(no), false);
    });
  }
});
