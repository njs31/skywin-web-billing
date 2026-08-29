import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapQwicksPaymentMode } from "./qwicks-payment";

describe("mapQwicksPaymentMode", () => {
  it("maps cash / COD to cash", () => {
    assert.equal(mapQwicksPaymentMode({ paymentMode: "CASH" }).mode, "cash");
    assert.equal(mapQwicksPaymentMode({ paymentMethod: "cod" }).mode, "cash");
    assert.equal(
      mapQwicksPaymentMode({ payment: { method: "Cash on Delivery" } }).mode,
      "cash"
    );
  });

  it("maps digital methods to upi", () => {
    for (const m of ["UPI", "gpay", "PhonePe", "card", "online", "wallet"]) {
      assert.equal(mapQwicksPaymentMode({ paymentMode: m }).mode, "upi", m);
    }
  });

  it("defaults to upi when nothing is provided", () => {
    assert.equal(mapQwicksPaymentMode({}).mode, "upi");
    assert.equal(mapQwicksPaymentMode({ paymentMode: "" }).mode, "upi");
  });

  it("returns the raw string for the audit note", () => {
    assert.equal(mapQwicksPaymentMode({ paymentMode: "Cash" }).raw, "Cash");
  });
});
