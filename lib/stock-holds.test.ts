import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyHolds, findShortages, heldNote } from "./stock-holds-core";

type Info = { name: string; batches: Array<{ batchId: number; qty: number }>; held?: number };

function snapshot(entries: Array<[number, Array<[number, number]>]>) {
  return new Map<number, Info>(
    entries.map(([productId, batches]) => [
      productId,
      { name: `P${productId}`, batches: batches.map(([batchId, qty]) => ({ batchId, qty })) },
    ])
  );
}

describe("applyHolds", () => {
  it("takes a product-level hold FEFO across batches", () => {
    const info = applyHolds(snapshot([[1, [[10, 2], [11, 5]]]]), [{ productId: 1, batchId: null, qty: 3 }]);
    assert.deepEqual(info.get(1)!.batches, [{ batchId: 11, qty: 4 }]);
    assert.equal(info.get(1)!.held, 3);
  });

  it("takes a pinned hold from its own batch", () => {
    const info = applyHolds(snapshot([[1, [[10, 2], [11, 5]]]]), [{ productId: 1, batchId: 11, qty: 4 }]);
    assert.deepEqual(info.get(1)!.batches, [
      { batchId: 10, qty: 2 },
      { batchId: 11, qty: 1 },
    ]);
  });

  it("applies pinned holds before product-level ones", () => {
    const info = applyHolds(snapshot([[1, [[10, 2], [11, 2]]]]), [
      { productId: 1, batchId: null, qty: 2 },
      { productId: 1, batchId: 10, qty: 2 },
    ]);
    // Pinned takes batch 10; the product-level hold then takes batch 11.
    assert.deepEqual(info.get(1)!.batches, []);
    assert.equal(info.get(1)!.held, 4);
  });

  it("never goes below zero when holds exceed stock", () => {
    const info = applyHolds(snapshot([[1, [[10, 1]]]]), [{ productId: 1, batchId: null, qty: 5 }]);
    assert.deepEqual(info.get(1)!.batches, []);
  });

  it("ignores holds on other products", () => {
    const info = applyHolds(snapshot([[1, [[10, 3]]]]), [{ productId: 2, batchId: null, qty: 3 }]);
    assert.deepEqual(info.get(1)!.batches, [{ batchId: 10, qty: 3 }]);
    assert.equal(info.get(1)!.held, 0);
  });
});

describe("findShortages", () => {
  it("reports every short line with what is left", () => {
    const shortages = findShortages(snapshot([[1, [[10, 1]]], [2, []], [3, [[30, 9]]]]), [
      { productId: 1, batchId: null, qty: 2 },
      { productId: 2, batchId: null, qty: 1 },
      { productId: 3, batchId: 30, qty: 9 },
    ]);
    assert.deepEqual(
      shortages.map((s) => [s.productId, s.available]),
      [
        [1, 1],
        [2, 0],
      ]
    );
  });

  it("lets two lines of one product share its stock", () => {
    const shortages = findShortages(snapshot([[1, [[10, 3]]]]), [
      { productId: 1, batchId: 10, qty: 2 },
      { productId: 1, batchId: null, qty: 2 },
    ]);
    assert.equal(shortages.length, 1);
    assert.equal(shortages[0]!.available, 1);
  });

  it("treats a pinned batch that is gone as short even if other batches have stock", () => {
    const shortages = findShortages(snapshot([[1, [[11, 5]]]]), [{ productId: 1, batchId: 10, qty: 1 }]);
    assert.equal(shortages.length, 1);
  });

  it("is empty when everything fits", () => {
    assert.deepEqual(findShortages(snapshot([[1, [[10, 5]]]]), [{ productId: 1, batchId: null, qty: 5 }]), []);
  });
});

describe("heldNote", () => {
  it("is empty without holds and explains them otherwise", () => {
    assert.equal(heldNote(0), "");
    assert.match(heldNote(2), /2 held for a SkyWin app payment/);
  });
});
