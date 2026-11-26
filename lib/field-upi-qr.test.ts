import { test } from "node:test";
import assert from "node:assert/strict";
import { upiQrExpiry, upiQrOwnedBy } from "./field-upi-qr";

const officerOrder = { fieldOrder: "SW-1", phone: "9000000002", officerPhone: "+91 98765 43210" };
const farmerOrder = { fieldOrder: "SW-2", phone: "9000000002" };

test("the officer who started the payment owns its QR", () => {
  assert.equal(upiQrOwnedBy(officerOrder, { phone: "9876543210", role: "officer" }), true);
  assert.equal(upiQrOwnedBy(officerOrder, { phone: "9123456789", role: "officer" }), false);
});

test("a farmer owns only a QR for their own order with no officer", () => {
  assert.equal(upiQrOwnedBy(farmerOrder, { phone: "+919000000002", role: "farmer" }), true);
  assert.equal(upiQrOwnedBy(officerOrder, { phone: "9000000002", role: "farmer" }), false);
  assert.equal(upiQrOwnedBy(farmerOrder, { phone: "9000000003", role: "farmer" }), false);
});

test("missing phones never match", () => {
  assert.equal(upiQrOwnedBy({ fieldOrder: "SW-3" }, { phone: "", role: "farmer" }), false);
  assert.equal(upiQrOwnedBy({ fieldOrder: "SW-3" }, { phone: "9876543210", role: "officer" }), false);
});

test("QR stays open 16 minutes", () => {
  assert.equal(upiQrExpiry(1_000_000_000_000), 1_000_000_000 + 960);
});
