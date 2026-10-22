import assert from "node:assert/strict";
import test from "node:test";
import { duplicateHsnKeys, hsnKey } from "./duplicate-hsn";

test("an HSN used by two products is a duplicate", () => {
  const keys = duplicateHsnKeys(["38089290", "38089290", "1001"]);
  assert.equal(keys.has("38089290"), true);
  assert.equal(keys.has("1001"), false);
});

test("blank HSN codes are not treated as duplicates", () => {
  const keys = duplicateHsnKeys(["", "  ", null, undefined]);
  assert.equal(keys.size, 0);
});

test("spacing and case do not hide a duplicate HSN", () => {
  assert.equal(hsnKey(" 38089290 "), "38089290");
  const keys = duplicateHsnKeys(["3808ab", " 3808AB "]);
  assert.equal(keys.has("3808AB"), true);
});
