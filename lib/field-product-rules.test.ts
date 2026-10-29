import assert from "node:assert/strict";
import test from "node:test";
import { fieldDetailGaps, httpUrlError } from "./field-product-rules";

test("a photo alone does not make farmer details complete", () => {
  assert.deepEqual(fieldDetailGaps({}), ["description", "ingredient or usage"]);
});

test("description and an ingredient are complete without a photo", () => {
  assert.deepEqual(
    fieldDetailGaps({
      description: "Protects paddy.",
      activeIngredient: "Chlorantraniliprole",
    }),
    []
  );
});

test("a usage row can stand in for the ingredient", () => {
  assert.deepEqual(
    fieldDetailGaps({
      description: "Protects paddy.",
      usage: [{ crop: "Paddy", pest: "Stem borer" }],
    }),
    []
  );
});

test("blank links are allowed and other links need http", () => {
  assert.equal(httpUrlError("  "), "");
  assert.equal(httpUrlError("brochure.pdf"), "Use a link that starts with http:// or https://.");
  assert.equal(httpUrlError("https://example.com/brochure.pdf"), "");
});
