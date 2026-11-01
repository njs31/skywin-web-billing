import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDemoSku, isReviewerPhone, REVIEWER_PHONE } from "./reviewer";

describe("reviewer account", () => {
  it("accepts only the dedicated review phone", () => {
    assert.equal(isReviewerPhone(REVIEWER_PHONE), true);
    assert.equal(isReviewerPhone("9000000001"), true);
    assert.equal(isReviewerPhone("+91 90000 00001"), true);
    assert.equal(isReviewerPhone("9999999999"), false);
  });

  it("treats only DEMO-RP skus as dummy catalog", () => {
    assert.equal(isDemoSku("DEMO-RP-001"), true);
    assert.equal(isDemoSku("DEMO-RP"), true);
    assert.equal(isDemoSku("10000921"), false);
    assert.equal(isDemoSku(null), false);
  });
});
