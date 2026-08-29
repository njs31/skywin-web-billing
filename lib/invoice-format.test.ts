import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRate } from "./utils";

describe("formatRate — GST rate display", () => {
  it("shows a 2.5% half-rate without rounding up to 3%", () => {
    assert.equal(formatRate(5 / 2), "2.5");
  });

  it("keeps whole rates without decimals", () => {
    assert.equal(formatRate(18 / 2), "9");
    assert.equal(formatRate(12 / 2), "6");
    assert.equal(formatRate(18), "18");
    assert.equal(formatRate(0), "0");
  });

  it("keeps up to two decimals and trims trailing zeros", () => {
    assert.equal(formatRate(0.5), "0.5");
    assert.equal(formatRate(2.5 / 2), "1.25");
    assert.equal(formatRate(2.5), "2.5");
  });

  it("accepts numeric strings and falls back to 0 for junk", () => {
    assert.equal(formatRate("2.5"), "2.5");
    assert.equal(formatRate("abc"), "0");
  });
});
