import assert from "node:assert/strict";
import test from "node:test";
import { teamOrderOfficerId, teamOrderStatus } from "./sales-team-status";

const officers = [
  { id: 48, name: "M. Elango" },
  { id: 35, name: "Gowtham" },
];

test("order status follows cancel, refund, then shipment", () => {
  assert.equal(teamOrderStatus({ status: "cancelled", refunded: 0, total: 100, waybill: "" }), "Cancelled");
  assert.equal(teamOrderStatus({ status: "active", refunded: 100, total: 100, waybill: "WB1" }), "Refunded");
  assert.equal(teamOrderStatus({ status: "active", refunded: 20, total: 100, waybill: "" }), "Partly refunded");
  assert.equal(teamOrderStatus({ status: "active", refunded: 0, total: 100, waybill: "WB1" }), "Shipped");
  assert.equal(teamOrderStatus({ status: "active", refunded: 0, total: 100, waybill: "" }), "Paid");
});

test("an order is credited to the officer who placed it", () => {
  assert.equal(
    teamOrderOfficerId(officers, { assignedOfficerId: 35, operatorName: "Field · M. Elango" }),
    48
  );
  assert.equal(
    teamOrderOfficerId(officers, { assignedOfficerId: 48, operatorName: "Counter" }),
    48
  );
  assert.equal(
    teamOrderOfficerId(officers, { assignedOfficerId: 99, operatorName: "Field · Someone else" }),
    null
  );
});
