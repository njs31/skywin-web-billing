import assert from "node:assert/strict";
import test from "node:test";
import { refundAmountPaise, remainingRefundPaise } from "./field-order-refund-rules";

test("remaining refund is captured minus what Razorpay already refunded", () => {
  assert.equal(remainingRefundPaise(137000, 0), 137000);
  assert.equal(remainingRefundPaise(137000, 50000), 87000);
  assert.equal(remainingRefundPaise(100, 100), 0);
  assert.equal(remainingRefundPaise(100, 250), 0);
});

test("partial refund amount is at least one rupee and not more than the remainder", () => {
  assert.equal(refundAmountPaise("150", 20000), 15000);
  assert.equal(refundAmountPaise("1.5", 20000), 150);
  assert.throws(() => refundAmountPaise("0.5", 20000), /minimum refund/);
  assert.throws(() => refundAmountPaise("250", 20000), /left to refund/);
  assert.throws(() => refundAmountPaise("10.555", 20000), /2 decimal/);
  assert.throws(() => refundAmountPaise("", 20000), /rupees/);
});
