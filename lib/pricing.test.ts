import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBelowCost, isBelowCost } from "./pricing";

describe("checkBelowCost", () => {
  it("flags a percent discount that drops the rate below cost", () => {
    // 100 rate, 40% off -> 60 effective, cost 80 -> below
    assert.equal(
      isBelowCost({ qty: 2, rate: 100, cost: 80, discountType: "percent", discountValue: 40 }),
      true
    );
  });

  it("flags a flat discount that drops the rate below cost", () => {
    // 2 x 100 = 200, minus 90 flat -> 110 / 2 = 55 effective, cost 70 -> below
    assert.equal(
      isBelowCost({ qty: 2, rate: 100, cost: 70, discountType: "value", discountValue: 90 }),
      true
    );
  });

  it("does not flag when the effective rate equals cost", () => {
    assert.equal(isBelowCost({ qty: 1, rate: 100, cost: 100 }), false);
  });

  it("does not flag when the effective rate is above cost", () => {
    assert.equal(isBelowCost({ qty: 3, rate: 120, cost: 90 }), false);
  });

  it("never flags a line with no cost recorded", () => {
    assert.equal(isBelowCost({ qty: 1, rate: 10, cost: 0 }), false);
    assert.equal(isBelowCost({ qty: 1, rate: 10 }), false);
  });

  it("reports the effective rate and cost", () => {
    const r = checkBelowCost({ qty: 4, rate: 50, cost: 45, discountType: "percent", discountValue: 20 });
    assert.equal(r.effectiveRate, 40);
    assert.equal(r.cost, 45);
    assert.equal(r.belowCost, true);
  });
});
