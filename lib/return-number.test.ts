import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatSaleReturnNo } from "./financial-year";

describe("sales return numbering", () => {
  it("formats a continuous FY series like SR/0001/26-27", () => {
    assert.equal(formatSaleReturnNo(1, "26-27"), "SR/0001/26-27");
    assert.equal(formatSaleReturnNo(42, "26-27"), "SR/0042/26-27");
    assert.equal(formatSaleReturnNo(1234, "26-27"), "SR/1234/26-27");
  });

  it("does not reset within the year (sequence just increments)", () => {
    const a = formatSaleReturnNo(7, "26-27");
    const b = formatSaleReturnNo(8, "26-27");
    assert.notEqual(a, b);
    assert.equal(a, "SR/0007/26-27");
    assert.equal(b, "SR/0008/26-27");
  });
});
