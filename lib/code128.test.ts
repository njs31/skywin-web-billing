import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeCode128,
  layoutCode128Dots,
  sanitizeCode128Text,
} from "./code128";
import {
  CONTENT_W_DOTS,
  LABEL_H_DOTS,
  LABEL_W_DOTS,
  PRINT_W_DOTS,
  PRINT_X_DOTS,
  mmToDots,
} from "./label-print-config";

function symbolsOf(modules: string) {
  assert.match(modules, /^0{10}/, "missing leading quiet zone");
  assert.match(modules, /0{10}$/, "missing trailing quiet zone");
  const body = modules.slice(10, -10);
  assert.equal((body.length - 13) % 11, 0, "symbol count is not whole");
  return (body.length - 13) / 11 + 1;
}

describe("CODE128", () => {
  it("uses Start B for alphanumeric codes", () => {
    assert.match(encodeCode128("SW000001"), /^0{10}11010010000/);
  });

  it("uses Start C for numeric codes, halving the symbol count", () => {
    assert.match(encodeCode128("8901234567890"), /^0{10}11010011100/);
    // 13 digits in subset B would need 17 symbols; subset C needs 10.
    assert.ok(symbolsOf(encodeCode128("8901234567890")) <= 11);
  });

  it("ends with the ISO stop pattern", () => {
    assert.match(encodeCode128("SW000001"), /11000111010110{10}$/);
  });

  it("sanitizes non-ASCII so the barcode still encodes", () => {
    assert.equal(sanitizeCode128Text("  SW 0001  "), "SW 0001");
    assert.ok(encodeCode128("यूरिया SW1").includes("11010010000"));
  });

  it("never emits an empty symbol for empty input", () => {
    assert.ok(encodeCode128("").length > 40);
  });
});

describe("barcode dot layout", () => {
  const codes = ["SW000001", "8901234567890", "SKW-ABCDEF", "SW999999"];

  it("snaps every bar to whole printer dots", () => {
    for (const code of codes) {
      const { bars, moduleDots } = layoutCode128Dots(code, CONTENT_W_DOTS);
      assert.ok(moduleDots >= 1, `${code} has no module width`);
      for (const bar of bars) {
        assert.equal(bar.x, Math.trunc(bar.x), `${code} bar x is fractional`);
        assert.equal(bar.width, Math.trunc(bar.width), `${code} bar is fractional`);
        assert.equal(bar.width % moduleDots, 0, `${code} bar is not a whole module`);
      }
    }
  });

  it("keeps a scannable module width for real product codes", () => {
    // 1 dot at 8 dots/mm is 0.125 mm, too fine to scan reliably off thermal.
    for (const code of ["SW000001", "8901234567890"]) {
      assert.ok(
        layoutCode128Dots(code, CONTENT_W_DOTS).moduleDots >= 2,
        `${code} would print a 1-dot module`
      );
    }
  });

  it("stays inside the content width", () => {
    for (const code of codes) {
      const { bars, totalDots } = layoutCode128Dots(code, CONTENT_W_DOTS);
      assert.ok(totalDots <= CONTENT_W_DOTS, `${code} overflows`);
      const right = Math.max(...bars.map((bar) => bar.x + bar.width));
      assert.ok(bars[0]!.x >= 0);
      assert.ok(right <= CONTENT_W_DOTS);
    }
  });
});

describe("thermal sticker geometry", () => {
  it("is 50 × 25 mm at 8 dots/mm (400 × 200 dots)", () => {
    assert.equal(LABEL_W_DOTS, 400);
    assert.equal(LABEL_H_DOTS, 200);
    assert.equal(mmToDots(50), 400);
    assert.equal(mmToDots(25), 200);
  });

  it("centres a 384-dot printable window inside the label", () => {
    assert.equal(PRINT_W_DOTS, 384);
    assert.equal(PRINT_X_DOTS, 8);
    assert.equal(PRINT_X_DOTS * 2 + PRINT_W_DOTS, LABEL_W_DOTS);
  });
});
