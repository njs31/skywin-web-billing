import test from "node:test";
import assert from "node:assert/strict";
import { parseProductListStatus } from "./product-status";

test("product list status", () => {
  assert.equal(parseProductListStatus(undefined), "active");
  assert.equal(parseProductListStatus(""), "active");
  assert.equal(parseProductListStatus("active"), "active");
  assert.equal(parseProductListStatus("inactive"), "inactive");
  assert.equal(parseProductListStatus("Inactive"), "active");
});
