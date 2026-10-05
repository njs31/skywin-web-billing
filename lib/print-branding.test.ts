import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRINT_TRADE_NAME,
  saleRateBracket,
  thankYouMessage,
} from "./print-branding";
import { inclusiveSalePrice } from "./gst";

describe("invoice print helpers", () => {
  it("shows the GST-inclusive sale rate in brackets", () => {
    assert.equal(saleRateBracket(100, 18), `(${inclusiveSalePrice(100, 18).toFixed(2)})`);
    assert.equal(saleRateBracket("207.90", "18"), `(${inclusiveSalePrice(207.9, 18).toFixed(2)})`);
  });

  it("thanks the customer with the print trade name", () => {
    assert.equal(
      thankYouMessage(),
      `Thank you for shopping at ${PRINT_TRADE_NAME}`
    );
  });
});
