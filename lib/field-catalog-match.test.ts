import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogProductIdsForQuery } from "./field-catalog-match";

const tree = [
  { slug: "pesticides", title: "PESTICIDES", queries: ["PESTICIDES"], subs: [{ slug: "all", title: "PESTICIDES", queries: ["PESTICIDES"], matchTerms: ["PESTICIDES"], productIds: [1, 2] }] },
  { slug: "micro-nutrients", title: "MICRO NUTRIENTS", queries: ["MICRO NUTRIENTS"], subs: [{ slug: "all", title: "MICRO NUTRIENTS", queries: [], matchTerms: [], productIds: [3, 2] }] },
];

test("category title search returns its products", () => {
  assert.deepEqual(catalogProductIdsForQuery(tree, "pesticides"), [1, 2]);
  assert.deepEqual(catalogProductIdsForQuery(tree, " Micro-Nutrients "), [3, 2]);
  assert.deepEqual(catalogProductIdsForQuery(tree, "micro-nutrients"), [3, 2]);
});

test("ordinary product search is untouched", () => {
  assert.equal(catalogProductIdsForQuery(tree, "mainex"), null);
  assert.equal(catalogProductIdsForQuery(tree, ""), null);
});
