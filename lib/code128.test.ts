import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeCode128, layoutCode128Bars, sanitizeCode128Text } from "./code128";
import {
  LABEL_LAYOUT,
  THERMAL_LABEL_H_MM,
  THERMAL_LABEL_H_PX,
  THERMAL_LABEL_W_MM,
  THERMAL_LABEL_W_PX,
  mmToPx,
} from "./label-print-config";

describe("CODE128-B", () => {
  it("uses Start B and the ISO stop pattern", () => {
    const bits = encodeCode128("SW000001");
    assert.match(bits, /^0{10}11010010000/);
    assert.match(bits, /11000111010110{10}$/);
  });

  it("keeps bars inside the 50×25 mm printable width", () => {
    const inner = THERMAL_LABEL_W_PX - LABEL_LAYOUT.padX * 2;
    const { bars, encoded, moduleWidth } = layoutCode128Bars(
      "SW000001",
      LABEL_LAYOUT.padX,
      inner
    );
    assert.ok(moduleWidth > 0);
    assert.ok(encoded.length > 40);
    const right = Math.max(...bars.map((bar) => bar.x + bar.width));
    assert.ok(bars[0]!.x >= LABEL_LAYOUT.padX);
    assert.ok(right <= LABEL_LAYOUT.padX + inner + 0.01);
  });

  it("sanitizes non-ASCII so the barcode still encodes", () => {
    assert.equal(sanitizeCode128Text("  SW 0001  "), "SW 0001");
    assert.ok(encodeCode128("यूरिया SW1").includes("11010010000"));
  });
});

describe("thermal sticker geometry", () => {
  it("is 50×25 mm at 203 DPI (400×200 px)", () => {
    assert.equal(THERMAL_LABEL_W_MM, 50);
    assert.equal(THERMAL_LABEL_H_MM, 25);
    assert.equal(THERMAL_LABEL_W_PX, 400);
    assert.equal(THERMAL_LABEL_H_PX, 200);
    assert.equal(mmToPx(50), 400);
    assert.equal(mmToPx(25), 200);
  });

  it("keeps header, barcode, and footer inside the 200 px height", () => {
    const bottom = LABEL_LAYOUT.footerY + LABEL_LAYOUT.footerSize;
    assert.ok(LABEL_LAYOUT.barcodeY + LABEL_LAYOUT.barcodeH < LABEL_LAYOUT.codeY);
    assert.ok(LABEL_LAYOUT.codeY + LABEL_LAYOUT.codeSize < LABEL_LAYOUT.footerY);
    assert.ok(bottom <= THERMAL_LABEL_H_PX - 4);
    assert.ok(LABEL_LAYOUT.barcodeH >= 80);
  });
});
