import assert from "node:assert/strict";
import test from "node:test";
import { isShippingAllowedPhone, isShippingHost, normalizeIndianMobile } from "./shipping-access";

test("phone formats are normalised to 10 digits", () => {
  for (const raw of ["6360334274", "+91 63603 34274", "916360334274", "06360334274", "+91-6360-334274", " 6360 334 274 "]) {
    assert.equal(normalizeIndianMobile(raw), "6360334274", raw);
  }
  for (const raw of ["", null, undefined, "12345", "1636033427412", "abc"]) {
    assert.equal(normalizeIndianMobile(raw as string), null, String(raw));
  }
});

test("only the three shipping numbers are allowed", () => {
  assert.equal(isShippingAllowedPhone("6360334274"), true);
  assert.equal(isShippingAllowedPhone("+91 94450 59191"), true);
  assert.equal(isShippingAllowedPhone("09894059895"), true);
  assert.equal(isShippingAllowedPhone("9999999999"), false);
  assert.equal(isShippingAllowedPhone("6360334275"), false);
  assert.equal(isShippingAllowedPhone("16360334274"), false);
  assert.equal(isShippingAllowedPhone(""), false);
});

test("shipping host is detected from forwarded host values", () => {
  assert.equal(isShippingHost("shipping.qwicksapp.com"), true);
  assert.equal(isShippingHost("Shipping.QwicksApp.com:443"), true);
  assert.equal(isShippingHost("shipping.qwicksapp.com, 10.0.0.1"), true);
  assert.equal(isShippingHost("skywin.qwicksapp.com"), false);
  assert.equal(isShippingHost("skywin-field.qwicksapp.com"), false);
  assert.equal(isShippingHost("ship.qwicksapp.com"), true);
  assert.equal(isShippingHost("Ship.QwicksApp.com:443"), true);
  assert.equal(isShippingHost("field.qwicksapp.com"), false);
  assert.equal(isShippingHost(""), false);
});
