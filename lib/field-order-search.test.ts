import { test } from "node:test";
import assert from "node:assert/strict";
import { orderMatches } from "./field-order-search";
import type { OrderView } from "./field-order-view";

const order: OrderView = {
  id: 1,
  orderId: "SW-1794311147789",
  invoiceNo: "INV-20261110-2869",
  date: "2026-11-10T11:46:00.000Z",
  status: "active",
  stage: null,
  farmerName: "Raja Kumar",
  farmerPhone: "+91 94444 60101",
  placedBy: "",
  paid: 100,
  refunded: 0,
  total: 100,
  paymentId: "pay_Ty5dMJET241Fcx",
  gps: null,
  mapsUrl: null,
  waybill: "19384610346124",
  trackUrl: null,
  goods: [{ name: "OR001 YIELDWIN 100 ML", qty: 1, batch: null, expiry: null, amount: 95.26 }],
  deliveryCharge: 0,
  source: "field",
  trackingId: "SW-1794311147789",
  history: [],
};

test("every word must match somewhere", () => {
  assert.equal(orderMatches(order, "raja yieldwin"), true);
  assert.equal(orderMatches(order, "yieldwin RAJA"), true);
  assert.equal(orderMatches(order, "raja urea"), false);
  assert.equal(orderMatches(order, ""), true);
});

test("phone numbers match with or without spaces and +91", () => {
  assert.equal(orderMatches(order, "9444460101"), true);
  assert.equal(orderMatches(order, "94444 60101"), true);
  assert.equal(orderMatches(order, "+919444460101"), true);
  assert.equal(orderMatches(order, "60101"), true);
  assert.equal(orderMatches(order, "1234567"), false);
});

test("ids, invoice, waybill and source", () => {
  assert.equal(orderMatches(order, "sw-17943"), true);
  assert.equal(orderMatches(order, "INV-20261110"), true);
  assert.equal(orderMatches(order, "1938461034"), true);
  assert.equal(orderMatches(order, "pay_ty5d"), true);
  assert.equal(orderMatches({ ...order, source: "qwicks" }, "qwicksapp"), true);
  assert.equal(orderMatches(order, "qwicksapp"), false);
});
