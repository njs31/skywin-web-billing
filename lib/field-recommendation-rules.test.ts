import assert from "node:assert/strict";
import test from "node:test";
import { cleanRecommendation, recommendationInputError } from "./field-recommendation-rules";

const valid = {
  crop: "  Paddy  ",
  stage: "Flowering",
  problem: "Grain filling",
  note: "Suggestions only.",
  productIds: [4, 9],
};

test("a recommendation needs a crop, a problem, and one catalogue product", () => {
  assert.equal(recommendationInputError({ ...valid, crop: " ", productIds: [] }), "Enter the crop (2–40 characters).");
  assert.equal(recommendationInputError({ ...valid, productIds: [] }), "Choose at least one product.");
  assert.equal(recommendationInputError({ ...valid, productIds: [4, 4] }), "Each product can be added once.");
});

test("saved text is trimmed and the chosen products stay in order", () => {
  assert.deepEqual(cleanRecommendation(valid), {
    crop: "Paddy",
    stage: "Flowering",
    problem: "Grain filling",
    note: "Suggestions only.",
    productIds: [4, 9],
  });
});
