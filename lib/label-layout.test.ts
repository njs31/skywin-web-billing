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
  it("is exactly one 50 × 24.5 mm sticker", () => {
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

  it("keeps the QR modules wide enough to scan", () => {
    // The label carries a QR of the code and no linear barcode (client design
    // 2026-09-08). A QR module finer than ~3 dots (0.375 mm at 8 dots/mm)
    // closes up under thermal bleed and a phone camera cannot resolve it.
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      assert.ok(
        plan.barcode.moduleDots >= 3,
        `${fields.code}: QR module is ${plan.barcode.moduleDots} dots`
      );
    }
  });

  it("biases the content column right of the canvas centre", () => {
    // The head prints ~4 mm left of where the geometry says, so a canvas-centred
    // column clips on the left. The column is placed right of centre to land the
    // visible print roughly centred on the sticker; the left inset must exceed
    // the right one, and both stay on the sticker.
    const leftInset = CONTENT_X_DOTS;
    const rightInset = LABEL_W_DOTS - (CONTENT_X_DOTS + CONTENT_W_DOTS);
    assert.ok(leftInset > rightInset, "column is not biased right");
    assert.ok(rightInset >= 0, "content column runs off the right of the canvas");
  });

  it("puts the QR on the right and keeps it square", () => {
    const contentRight = CONTENT_X_DOTS + CONTENT_W_DOTS;
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      const minX = Math.min(...plan.bars.map((b) => b.x));
      const maxX = Math.max(...plan.bars.map((b) => b.x + b.width));
      const minY = Math.min(...plan.bars.map((b) => b.y));
      const maxY = Math.max(...plan.bars.map((b) => b.y + b.height));

      // Right-aligned, a couple of mm in from the content edge.
      assert.ok(
        contentRight - maxX <= 6,
        `${fields.code}: QR right edge is ${contentRight - maxX} dots from the content edge`
      );
      // Sits in the right half of the label, not over the left text column.
      assert.ok(minX >= LABEL_W_DOTS / 2, `${fields.code}: QR reaches into the left column`);
      // Square, within one module.
      assert.ok(
        Math.abs((maxX - minX) - (maxY - minY)) <= plan.barcode.moduleDots,
        `${fields.code}: QR is not square`
      );
    }
  });

  it("carries a QR code, not a single-height barcode", () => {
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      // A QR has many short module-height bars stacked over several rows; a
      // Code 128 would be a handful of full-height bars all sharing one y.
      const rows = new Set(plan.bars.map((b) => b.y));
      assert.ok(rows.size >= 10, `${fields.code}: only ${rows.size} bar rows — not a QR`);
      assert.ok(
        plan.bars.every((b) => b.height === plan.barcode.moduleDots),
        `${fields.code}: a bar is taller than one QR module`
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

  it("never drops the price or the code text", () => {
    for (const fields of SAMPLES) {
      const texts = buildLabelPlan(fields).texts.map((item) => item.text);
      assert.ok(
        texts.some((text) => text === `RATE: ${fields.mrp}`),
        `${fields.code}: RATE was truncated`
      );
      assert.ok(texts.includes(fields.code), `${fields.code}: code text was truncated`);
    }
  });

  it("prints the shop name and the tagline in brackets", () => {
    const texts = buildLabelPlan(SAMPLES[0]!).texts.map((item) => item.text);
    assert.ok(texts.includes("SKYWIN BIOTECH"), "shop name missing");
    assert.ok(
      texts.some((text) => text.startsWith("(") && text.endsWith(")")),
      "bracketed tagline missing"
    );
  });

  it("keeps EXP labelled even with no date", () => {
    const plan = buildLabelPlan(SAMPLES[2]!); // exp: ""
    assert.ok(
      plan.texts.some((item) => item.text === "EXP:"),
      "EXP: label was dropped when there is no date"
    );
  });

  it("gives the product name one left-aligned line", () => {
    const plan = buildLabelPlan(SAMPLES[1]!); // the longest name in the catalogue
    const nameRuns = plan.texts.filter(
      (item) => item.baseline === LABEL_LAYOUT.nameBaseline
    );
    assert.equal(nameRuns.length, 1);
    assert.equal(nameRuns[0]!.anchor, "start");
    assert.ok(nameRuns[0]!.text.endsWith("…"), "a name too long to fit should be clipped");
  });
});
