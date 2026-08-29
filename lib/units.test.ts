import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMeasuredUnit,
  qtyFieldLabel,
  parseQtyInput,
  formatQtyWithUnit,
} from "./units";

describe("units of measurement", () => {
  it("recognises measured units", () => {
    assert.equal(isMeasuredUnit("Gram"), true);
    assert.equal(isMeasuredUnit("Metre"), true);
    assert.equal(isMeasuredUnit("Pcs"), false);
    assert.equal(isMeasuredUnit(null), false);
  });

  it("labels the POS quantity field by unit", () => {
    assert.equal(qtyFieldLabel("Gram"), "Weight (Gram)");
    assert.equal(qtyFieldLabel("Metre"), "Length (Metre)");
    assert.equal(qtyFieldLabel("Pcs"), "Quantity");
  });

  it("keeps decimals for measured units and rounds pieces", () => {
    assert.equal(parseQtyInput("500", "Gram"), 500);
    assert.equal(parseQtyInput("2.5", "Metre"), 2.5);
    assert.equal(parseQtyInput("3.7", "Pcs"), 4);
    assert.equal(parseQtyInput("0", "Gram"), 0);
  });

  it("derives sale value as quantity x per-unit rate", () => {
    // 500 g at Rs 2/g = Rs 1000; sell 250 g = Rs 500
    const ratePerGram = 2;
    assert.equal(parseQtyInput("500", "Gram") * ratePerGram, 1000);
    assert.equal(parseQtyInput("250", "Gram") * ratePerGram, 500);
  });

  it("formats a quantity with its unit", () => {
    assert.equal(formatQtyWithUnit(500, "Gram"), "500 Gram");
    assert.equal(formatQtyWithUnit("3", "Pcs"), "3 Pcs");
  });
});
