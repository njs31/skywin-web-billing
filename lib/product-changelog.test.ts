import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffProductFields, hasProductChanges } from "./product-changelog";

describe("product changelog diff", () => {
  it("returns no changes when values match", () => {
    const summary = diffProductFields(
      { saleRate: "100.00", name: "DAP" },
      { saleRate: 100, name: "DAP" }
    );
    assert.equal(hasProductChanges(summary), false);
  });

  it("records the user-visible field and from/to values", () => {
    const summary = diffProductFields(
      { saleRate: "100.00", name: "DAP" },
      { saleRate: 110, name: "DAP 50KG" }
    );
    assert.deepEqual(summary["Sale rate"], { from: "100.00", to: "110" });
    assert.deepEqual(summary.Name, { from: "DAP", to: "DAP 50KG" });
  });
});
