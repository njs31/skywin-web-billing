import assert from "node:assert/strict";
import test from "node:test";
import {
  applicableCrops,
  fieldDetailGaps,
  formatGst,
  formatInr,
  formatQty,
  httpUrlError,
  orderQtyPairError,
  usageInstructionLines,
} from "./field-product-rules";

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

test("order quantities are optional, positive, and min cannot exceed max", () => {
  assert.equal(orderQtyPairError("", ""), "");
  assert.equal(orderQtyPairError("1", "12"), "");
  assert.equal(orderQtyPairError("1.5", "1.25").includes("cannot be higher"), true);
  assert.equal(orderQtyPairError("0", "").includes("greater than zero"), true);
  assert.equal(orderQtyPairError("a", "2").includes("Minimum"), true);
});

test("applicable crops keep written crops and usage crops without duplicates", () => {
  assert.deepEqual(
    applicableCrops("Paddy, maize", [{ crop: "Paddy" }, { crop: "Cotton" }, { crop: "" }]),
    ["Paddy", "maize", "Cotton"]
  );
  assert.deepEqual(applicableCrops("", [{ crop: "Sugarcane" }]), ["Sugarcane"]);
});

test("usage rows become application lines", () => {
  assert.deepEqual(
    usageInstructionLines([{ crop: "Paddy", pest: "Stem borer", perAcre: "2 ml", perHectare: "" }]),
    ["Paddy · Stem borer — 2 ml / acre"]
  );
});

test("empty catalogue money and quantities stay blank", () => {
  assert.equal(formatInr(null), "—");
  assert.equal(formatInr("750"), "₹750.00");
  assert.equal(formatGst("18"), "18%");
  assert.equal(formatQty(null), "—");
  assert.equal(formatQty("0"), "0");
  assert.equal(formatQty("12.50"), "12.5");
});
