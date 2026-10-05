import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRINT_TRADE_NAME,
  customerArea,
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

  it("prints Area from village, then address, then taluk/district", () => {
    assert.equal(customerArea({ village: "Thiruvidaimarudur" }), "Thiruvidaimarudur");
    assert.equal(
      customerArea({ village: "  ", address: "ILANTHURAI" }),
      "ILANTHURAI"
    );
    assert.equal(
      customerArea({ taluk: "Kumbakonam", district: "Thanjavur" }),
      "Kumbakonam, Thanjavur"
    );
    assert.equal(customerArea({}), null);
  });
});
