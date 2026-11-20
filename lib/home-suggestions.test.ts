import assert from "node:assert/strict";
import test from "node:test";
import { cropSuggestionIds, pickSuggestionSource, pinCode, uniquePins } from "./home-suggestions";

const sources = [
  { source: "buy_again" as const, ids: [1, 2, 3] },
  { source: "crop" as const, ids: [4, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  { source: "nearby" as const, ids: [20, 21, 22, 23] },
  { source: "bestsellers" as const, ids: [30, 31, 32, 33, 34] },
];

test("the first source with at least 4 products wins, capped at 10", () => {
  assert.deepEqual(pickSuggestionSource(sources), {
    source: "crop",
    ids: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  });
  assert.equal(pickSuggestionSource([{ source: "buy_again", ids: [1, 1, 2, 3, 4] }])?.source, "buy_again");
  assert.equal(pickSuggestionSource([{ source: "bestsellers", ids: [1, 2, 3] }]), null);
});

test("crop suggestions need a profile crop and a tagged catalogue product", () => {
  const products = [
    { id: 1, crops: "Paddy, Maize", usage: [] },
    { id: 2, crops: "", usage: [{ crop: "Cotton" }] },
    { id: 3, crops: "", usage: [] },
  ];
  assert.deepEqual(cropSuggestionIds(products, []), []);
  assert.deepEqual(cropSuggestionIds([{ id: 3, crops: "", usage: [] }], ["Paddy"]), []);
  assert.deepEqual(cropSuggestionIds(products, [" maize "]), [1]);
  assert.deepEqual(cropSuggestionIds(products, ["Cotton"]), [2]);
});

test("a PIN is the last 6 digits", () => {
  assert.equal(pinCode("612 401"), "612401");
  assert.equal(pinCode("401"), "");
  assert.deepEqual(uniquePins(["612401", "612401", "600001"]), ["612401", "600001"]);
});
