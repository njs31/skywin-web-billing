import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, timingSafeEqual } from "node:crypto";

function keysMatch(provided: string, expected: string) {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

describe("API key verification", () => {
  it("fails closed when no configured keys exist", () => {
    const provided = "any-key";
    const valid = [undefined, null, "  "].filter((k): k is string => Boolean(k?.trim()));
    assert.equal(valid.length, 0);
    assert.equal(Boolean(provided) && valid.some((k) => keysMatch(provided, k)), false);
  });

  it("accepts a matching key", () => {
    assert.equal(keysMatch("skywin-secret", "skywin-secret"), true);
  });

  it("rejects a mismatched key", () => {
    assert.equal(keysMatch("wrong", "skywin-secret"), false);
  });
});
