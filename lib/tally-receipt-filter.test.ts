import assert from "node:assert/strict";
import test from "node:test";
import { tallyReceiptIncluded } from "./tally-receipt-filter";

const GST = "33AABCU9603R1ZM";

test("keeps a credit invoice even without a GSTIN", () => {
  assert.equal(
    tallyReceiptIncluded([{ paymentMode: "credit", gstin: null, status: "active" }]),
    true
  );
});

test("keeps a cash invoice when the customer has a GSTIN", () => {
  assert.equal(
    tallyReceiptIncluded([{ paymentMode: "cash", gstin: GST, status: "active" }]),
    true
  );
});

test("drops cash, UPI, and URP invoices", () => {
  assert.equal(
    tallyReceiptIncluded([{ paymentMode: "upi", gstin: "URP", status: "active" }]),
    false
  );
  assert.equal(
    tallyReceiptIncluded([{ paymentMode: "cash", gstin: "", status: "active" }]),
    false
  );
  assert.equal(tallyReceiptIncluded([]), false);
});

test("drops a cancelled credit invoice", () => {
  assert.equal(
    tallyReceiptIncluded([
      { paymentMode: "credit", gstin: GST, status: "cancelled" },
    ]),
    false
  );
});

test("keeps a receipt when one of its invoices qualifies", () => {
  assert.equal(
    tallyReceiptIncluded([
      { paymentMode: "cash", gstin: null, status: "active" },
      { paymentMode: "credit", gstin: null, status: "active" },
    ]),
    true
  );
});
