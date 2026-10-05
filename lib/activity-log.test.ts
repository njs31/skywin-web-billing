import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatSignedQty,
  labelsPrintedMessage,
  productUpdatedMessage,
  stockDeltaMessage,
  stockSetMessage,
} from "./activity-log";

describe("activity log sentences", () => {
  it("says who changed stock by a delta", () => {
    assert.equal(
      stockDeltaMessage("Jai", "Apple", 2),
      "Jai updated the stock of Apple as +2"
    );
    assert.equal(
      stockDeltaMessage("Jai", "Apple", -1.5),
      "Jai updated the stock of Apple as -1.5"
    );
  });

  it("says who set stock to an amount", () => {
    assert.equal(
      stockSetMessage("Jai", "Apple", 100),
      "Jai updated the stock of Apple to 100"
    );
  });

  it("says who printed labels", () => {
    assert.equal(labelsPrintedMessage("Jai", 100), "Jai printed 100 labels");
    assert.equal(
      labelsPrintedMessage("Jai", 100, "Apple"),
      "Jai printed 100 labels of Apple"
    );
  });

  it("lists other product field edits", () => {
    assert.equal(
      productUpdatedMessage("Jai", "Apple", ["Sale rate 10 → 12"]),
      "Jai updated Apple (Sale rate 10 → 12)"
    );
  });

  it("formats signed quantities without trailing zeros", () => {
    assert.equal(formatSignedQty(2), "+2");
    assert.equal(formatSignedQty(-2), "-2");
    assert.equal(formatSignedQty(0), "0");
  });
});
