import assert from "node:assert/strict";
import test from "node:test";
import { farmerFieldErrors, loginPhoneChanged } from "./field-farmer-rules";

test("name and a 10-digit phone are required for a new farmer", () => {
  const errors = farmerFieldErrors({ name: "  ", phone: "123", requirePhone: true });
  assert.equal(errors.name, "Name is required.");
  assert.equal(errors.phone, "Enter a 10-digit phone number.");
});

test("an edit can keep the login phone and still check PIN and acres", () => {
  const errors = farmerFieldErrors({
    name: "Ravi",
    pinCode: "612",
    altPhone: "99",
    farms: [{ acres: -1 }],
    requirePhone: false,
  });
  assert.equal(errors.phone, undefined);
  assert.equal(errors.pin, "PIN must be 6 digits.");
  assert.equal(errors.altPhone, "Alternate phone must be 10 digits.");
  assert.equal(errors.acres, "Acreage must be zero or more.");
});

test("a blank PIN is allowed", () => {
  assert.deepEqual(farmerFieldErrors({ name: "Ravi", pinCode: "  " }), {});
});

test("changing the login phone is detected from the last 10 digits", () => {
  assert.equal(loginPhoneChanged("9942499930", "+91 99424 99930"), false);
  assert.equal(loginPhoneChanged("9942499930", "6360334274"), true);
  assert.equal(loginPhoneChanged("9942499930", undefined), false);
});
