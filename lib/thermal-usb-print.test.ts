import assert from "node:assert/strict";
import test from "node:test";
import { buildEscPosRasterCommand } from "./thermal-usb-print";

test("encodes a raster image instead of browser/PostScript text", () => {
  const payload = buildEscPosRasterCommand({
    bytesPerRow: 50,
    height: 200,
    bytes: new Uint8Array(50 * 200).fill(0xaa),
  });

  assert.deepEqual([...payload.slice(0, 14)], [
    0x1b,
    0x40,
    0x1b,
    0x33,
    0x18,
    0x1d,
    0x76,
    0x30,
    0x00,
    50,
    0,
    200,
    0,
    0xaa,
  ]);
  assert.equal(payload.length, 13 + 50 * 200 + 4);
  assert.deepEqual([...payload.slice(-4)], [0x0a, 0x1b, 0x64, 0x02]);
});

test("rejects malformed raster data", () => {
  assert.throws(
    () => buildEscPosRasterCommand({ bytesPerRow: 2, height: 2, bytes: new Uint8Array(3) }),
    /does not match/
  );
});
