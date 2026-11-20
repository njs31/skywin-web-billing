import assert from "node:assert/strict";
import test from "node:test";
import { canUseFieldRecommendations, mayRecommendFor } from "./field-recommendation-access";

test("only field officers and admins use recommendations", () => {
  assert.equal(canUseFieldRecommendations("sales_officer"), true);
  assert.equal(canUseFieldRecommendations("admin"), true);
  for (const role of ["regional_manager", "sales_manager", "cashier", "store_manager", "manager", "dealer", "", null]) {
    assert.equal(canUseFieldRecommendations(role), false, String(role));
  }
});

test("a field officer may recommend only for his own farmers", () => {
  const officer = { id: 7, role: "sales_officer" };
  assert.equal(mayRecommendFor(officer, { type: "farmer", assignedOfficerId: 7 }), true);
  assert.equal(mayRecommendFor(officer, { type: "farmer", assignedOfficerId: 8 }), false);
  assert.equal(mayRecommendFor(officer, { type: "farmer", assignedOfficerId: null }), false);
  assert.equal(mayRecommendFor(officer, { type: "retail", assignedOfficerId: 7 }), false);
  assert.equal(mayRecommendFor(officer, null), false);
});

test("an admin may recommend for any farmer; other roles for none", () => {
  assert.equal(mayRecommendFor({ id: 1, role: "admin" }, { type: "farmer", assignedOfficerId: 9 }), true);
  assert.equal(mayRecommendFor({ id: 2, role: "regional_manager" }, { type: "farmer", assignedOfficerId: 2 }), false);
});
