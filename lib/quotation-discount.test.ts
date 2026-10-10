import test from "node:test";
import assert from "node:assert/strict";
import { quotationLineDiscountPercent } from "./quotation-discount";

test("quotation line starts from the product discount", () => {
  assert.equal(quotationLineDiscountPercent({ discountPercent: "10.00" }), 10);
  assert.equal(quotationLineDiscountPercent({ discountPercent: 10 }), 10);
  assert.equal(quotationLineDiscountPercent({}), 0);
  assert.equal(quotationLineDiscountPercent({ discountPercent: null }), 0);
});
