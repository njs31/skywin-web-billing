import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLabelPlan, measureText } from "./label-layout";
import {
  CONTENT_W_DOTS,
  CONTENT_X_DOTS,
  LABEL_H_DOTS,
  LABEL_LAYOUT,
  LABEL_W_DOTS,
  PRINT_BAND_BOTTOM_DOTS,
  PRINT_BAND_H_DOTS,
  PRINT_BAND_TOP_DOTS,
  PRINT_TOP_OFFSET_DOTS,
  PRINT_W_DOTS,
  PRINT_X_DOTS,
} from "./label-print-config";

const LEFT = PRINT_X_DOTS;
const RIGHT = PRINT_X_DOTS + PRINT_W_DOTS;

const SAMPLES = [
  { code: "SW000001", name: "UREA 50 KG", mrp: "1234.00", exp: "01/12/2026" },
  {
    code: "8901234567890",
    // The longest kind of name the catalogue actually holds.
    name: "TATA RALLIS ASATAF INSECTICIDE ACEPHATE 75% SP 500 GRAM POUCH",
    mrp: "18999.00",
    exp: "31/03/2027",
  },
  { code: "SKW-ABCDEF", name: "DAP", mrp: "0.00", exp: "" },
  { code: "SW999999", name: "SUPERPHOSPHATEGRANULARSINGLEBAGXXL", mrp: "9.50", exp: "" },
];

/** Horizontal ink extent of one text run, given its anchor. */
function textExtent(item: ReturnType<typeof buildLabelPlan>["texts"][number]) {
  const width = measureText(item.text, item.size, item.bold);
  if (item.anchor === "middle") return [item.x - width / 2, item.x + width / 2];
  if (item.anchor === "end") return [item.x - width, item.x];
  return [item.x, item.x + width];
}

describe("label plan", () => {
  it("is exactly one 50 × 30 mm sticker", () => {
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      assert.equal(plan.widthDots, LABEL_W_DOTS);
      assert.equal(plan.heightDots, LABEL_H_DOTS);
    }
  });

  it("keeps every bar inside the printable window", () => {
    for (const fields of SAMPLES) {
      for (const bar of buildLabelPlan(fields).bars) {
        assert.ok(bar.x >= LEFT, `${fields.code}: bar starts left of the head`);
        assert.ok(
          bar.x + bar.width <= RIGHT,
          `${fields.code}: bar runs past the head`
        );
      }
    }
  });

  it("keeps every text run inside the printable window", () => {
    for (const fields of SAMPLES) {
      for (const item of buildLabelPlan(fields).texts) {
        const [start, end] = textExtent(item);
        assert.ok(start! >= LEFT - 0.5, `${fields.code}: "${item.text}" overflows left`);
        assert.ok(end! <= RIGHT + 0.5, `${fields.code}: "${item.text}" overflows right`);
      }
    }
  });

  it("keeps all ink inside the band the printer can reach", () => {
    // Not merely inside the sticker. After a GS FF gap seek the paper is
    // parked 5 mm past the die cut, so rows above PRINT_BAND_TOP_DOTS never
    // reach the head, and rows below PRINT_BAND_BOTTOM_DOTS land across the
    // next die cut — which is how EXP and MRP ended up on the next sticker.
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      for (const bar of plan.bars) {
        assert.ok(
          bar.y >= PRINT_BAND_TOP_DOTS,
          `${fields.code}: a bar starts above the printable band`
        );
        assert.ok(
          bar.y + bar.height <= PRINT_BAND_BOTTOM_DOTS,
          `${fields.code}: a bar runs past the printable band`
        );
      }
      for (const item of plan.texts) {
        // Helvetica ascends ~0.72 em above and descends ~0.21 em below baseline.
        assert.ok(
          item.baseline - item.size * 0.75 >= PRINT_BAND_TOP_DOTS,
          `${item.text} is above the printable band`
        );
        assert.ok(
          item.baseline + item.size * 0.25 <= PRINT_BAND_BOTTOM_DOTS,
          `${item.text} is below the printable band`
        );
      }
    }
  });

  it("keeps the barcode modules wide enough to scan", () => {
    // The QR used to rescue a marginal read; it has been removed, so the
    // Code 128 is the only machine-readable mark and one dot per module —
    // 0.125 mm at 8 dots/mm — is finer than thermal bleed can hold.
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      assert.ok(
        plan.barcode.moduleDots >= 2,
        `${fields.code}: module is ${plan.barcode.moduleDots} dots`
      );
    }
  });

  it("centres the content column on the sticker", () => {
    // The bug this guards: the column was centred on the printable window
    // instead, and since the head starts 4 mm in from the sticker's left edge
    // and overhangs its right, that printed the whole label 3 mm right and
    // pushed MRP hard against the edge.
    assert.equal(
      CONTENT_X_DOTS + CONTENT_W_DOTS / 2,
      LABEL_W_DOTS / 2,
      "content column is not centred on the sticker"
    );
  });

  it("centres the barcode in the content column", () => {
    const contentRight = CONTENT_X_DOTS + CONTENT_W_DOTS;
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      const xs = plan.bars.map((bar) => bar.x);
      const ends = plan.bars.map((bar) => bar.x + bar.width);
      const leftGap = Math.min(...xs) - CONTENT_X_DOTS;
      const rightGap = contentRight - Math.max(...ends);
      // Whole-dot modules mean the two margins can differ by a dot or so.
      assert.ok(
        Math.abs(leftGap - rightGap) <= 2,
        `${fields.code}: barcode off-centre by ${Math.abs(leftGap - rightGap)} dots`
      );
    }
  });

  it("has no QR code", () => {
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      // Every bar is a barcode bar: same y, same height, full bar height.
      assert.ok(
        plan.bars.every(
          (bar) => bar.y === plan.barcode.y && bar.height === plan.barcode.height
        ),
        `${fields.code}: a bar is not part of the Code 128`
      );
    }
  });

  it("stops the printed band before the next die cut", () => {
    // The raster starts where the seek parks and must finish inside the same
    // sticker. If it does not, the tail crosses the gap and GS FF has no
    // travel left, so it hunts the following gap and leaves a blank sticker.
    assert.ok(
      PRINT_TOP_OFFSET_DOTS + PRINT_BAND_H_DOTS <= LABEL_H_DOTS,
      "the printed band overruns the sticker"
    );
    assert.equal(PRINT_BAND_BOTTOM_DOTS, PRINT_TOP_OFFSET_DOTS + PRINT_BAND_H_DOTS);
  });

  it("never drops the price or the barcode text", () => {
    for (const fields of SAMPLES) {
      const texts = buildLabelPlan(fields).texts.map((item) => item.text);
      assert.ok(
        texts.some((text) => text === `MRP ${fields.mrp}`),
        `${fields.code}: MRP was truncated`
      );
      assert.ok(texts.includes(fields.code), `${fields.code}: code text was truncated`);
    }
  });

  it("gives a long product name every line it is allowed", () => {
    const plan = buildLabelPlan(SAMPLES[1]!);
    const { nameBaseline, nameLineHeight, nameLines } = LABEL_LAYOUT;
    const last = nameBaseline + (nameLines - 1) * nameLineHeight;
    const lines = plan.texts.filter(
      (item) => item.baseline >= nameBaseline && item.baseline <= last
    );
    assert.equal(lines.length, nameLines);
  });
});
