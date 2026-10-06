import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { purchaseStockDeltas, purchaseStockKey } from "./purchase-stock";

describe("purchaseStockDeltas", () => {
  it("is a no-op when qty and batch are unchanged", () => {
    const key = purchaseStockKey(10, "OPENING");
    const deltas = purchaseStockDeltas(new Map([[key, 4]]), new Map([[key, 4]]));
    assert.equal(deltas.length, 1);
    assert.equal(deltas[0]!.delta, 0);
    assert.equal(deltas[0]!.oldQty, 4);
    assert.equal(deltas[0]!.newQty, 4);
  });

  it("adds only the extra units when qty increases", () => {
    const key = purchaseStockKey(10, "OPENING");
    const [row] = purchaseStockDeltas(new Map([[key, 4]]), new Map([[key, 10]]));
    assert.equal(row!.delta, 6);
  });

  it("deducts only the dropped units when qty decreases", () => {
    const key = purchaseStockKey(10, "OPENING");
    const [row] = purchaseStockDeltas(new Map([[key, 4]]), new Map([[key, 2]]));
    assert.equal(row!.delta, -2);
  });

  it("treats a removed line as a full deduction", () => {
    const key = purchaseStockKey(10, "OPENING");
    const [row] = purchaseStockDeltas(new Map([[key, 4]]), new Map());
    assert.equal(row!.newQty, 0);
    assert.equal(row!.delta, -4);
  });
});
