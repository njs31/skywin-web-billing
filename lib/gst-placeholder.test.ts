import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gstinRequiresUniqueness,
  isPlaceholderGstin,
  isValidGstin,
  normalizeEnteredGstin,
} from "./gst";

describe("GSTIN placeholders and uniqueness", () => {
  it("treats URP and empty as placeholders, not real GSTINs", () => {
    assert.equal(isPlaceholderGstin("URP"), true);
    assert.equal(isPlaceholderGstin("urp"), true);
    assert.equal(isPlaceholderGstin(""), true);
    assert.equal(isPlaceholderGstin(null), true);
    assert.equal(isValidGstin("URP"), false);
    assert.equal(gstinRequiresUniqueness("URP"), false);
  });

  it("allows a second URP (no uniqueness)", () => {
    const first = normalizeEnteredGstin("URP");
    const second = normalizeEnteredGstin("urp");
    assert.equal(first, "URP");
    assert.equal(second, "URP");
    assert.equal(gstinRequiresUniqueness(first), false);
    assert.equal(gstinRequiresUniqueness(second), false);
  });

  it("requires 15 characters for a real GSTIN", () => {
    assert.throws(() => normalizeEnteredGstin("33ABCDE"), /15-character/);
    assert.throws(() => normalizeEnteredGstin("33ABCDE1234F1Z"), /15-character/);
    const valid = normalizeEnteredGstin("33ABCDE1234F1Z5");
    assert.equal(valid, "33ABCDE1234F1Z5");
    assert.equal(gstinRequiresUniqueness(valid), true);
  });
});
