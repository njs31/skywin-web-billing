import test from "node:test";
import assert from "node:assert/strict";
import { calculateGstBreakdown, equalCgstSgst } from "./gst";

test("CGST and SGST stay equal when the tax has an odd paisa", () => {
  assert.deepEqual(equalCgstSgst(775.63), { cgst: 387.82, sgst: 387.82 });
  assert.deepEqual(equalCgstSgst(0), { cgst: 0, sgst: 0 });

  const gst = calculateGstBreakdown(
    [{ qty: 1, rate: 10.03, gstRate: 18 }],
    { interstate: false }
  );
  assert.equal(gst.cgst, gst.sgst);
  assert.equal(gst.igst, 0);
});

test("interstate bills keep the whole tax in IGST", () => {
  const gst = calculateGstBreakdown(
    [{ qty: 1, rate: 10.03, gstRate: 18 }],
    { interstate: true }
  );
  assert.equal(gst.cgst, 0);
  assert.equal(gst.sgst, 0);
  assert.equal(gst.cgst, gst.sgst);
  assert.ok(gst.igst > 0);
});
