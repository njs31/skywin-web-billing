import test from "node:test";
import assert from "node:assert/strict";
import { movedOrder } from "./field-catalog-order";

test("display order: up and down swap with the neighbour", () => {
  assert.deepEqual(movedOrder([1, 2, 3, 4], 3, "up"), [1, 3, 2, 4]);
  assert.deepEqual(movedOrder([1, 2, 3, 4], 2, "down"), [1, 3, 2, 4]);
});

test("display order: top and bottom move to the ends", () => {
  assert.deepEqual(movedOrder([1, 2, 3, 4], 4, "top"), [4, 1, 2, 3]);
  assert.deepEqual(movedOrder([1, 2, 3, 4], 1, "bottom"), [2, 3, 4, 1]);
});

test("display order: nothing to do at the ends or for an unknown id", () => {
  assert.equal(movedOrder([1, 2, 3], 1, "up"), null);
  assert.equal(movedOrder([1, 2, 3], 1, "top"), null);
  assert.equal(movedOrder([1, 2, 3], 3, "down"), null);
  assert.equal(movedOrder([1, 2, 3], 3, "bottom"), null);
  assert.equal(movedOrder([1, 2, 3], 9, "up"), null);
  assert.equal(movedOrder([], 1, "down"), null);
});

test("display order: the input list is not changed and every id is kept once", () => {
  const ids = [5, 6, 7];
  const next = movedOrder(ids, 7, "up")!;
  assert.deepEqual(ids, [5, 6, 7]);
  assert.deepEqual([...next].sort(), [5, 6, 7]);
});
