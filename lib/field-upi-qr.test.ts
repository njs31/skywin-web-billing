import { test } from "node:test";
import assert from "node:assert/strict";
import { upiQrExpiry, upiQrOwnedBy } from "./field-upi-qr";
import { blackSquare } from "./field-upi-qr-image";

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

/** A poster like Razorpay's: white page, a blue band behind the card, one square of black modules. */
function poster(qr: { left: number; top: number; size: number } | null) {
  const width = 300;
  const height = 700;
  const data = new Uint8Array(width * height * 3).fill(255);
  const paint = (x: number, y: number, rgb: [number, number, number]) => data.set(rgb, (y * width + x) * 3);
  for (let y = 200; y < 500; y++) for (let x = 0; x < width; x++) paint(x, y, [40, 90, 220]);
  if (qr) {
    for (let y = qr.top; y < qr.top + qr.size; y++)
      for (let x = qr.left; x < qr.left + qr.size; x++) {
        const dark = (Math.floor((x - qr.left) / 8) + Math.floor((y - qr.top) / 8)) % 2 === 0;
        paint(x, y, dark ? [0, 0, 0] : [255, 255, 255]);
      }
  }
  return { data, width, height };
}

test("finds the black QR square on Razorpay's poster, not the blue band", () => {
  const p = poster({ left: 60, top: 250, size: 160 });
  assert.deepEqual(blackSquare(p.data, p.width, p.height, 3), { left: 60, top: 250, size: 160 });
});

test("no square, no crop (the whole poster is sent instead)", () => {
  const p = poster(null);
  assert.equal(blackSquare(p.data, p.width, p.height, 3), null);
});
