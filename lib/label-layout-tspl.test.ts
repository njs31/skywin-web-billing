/**
 * Same category of checks as label-layout.test.ts, run against
 * TSPL_GEOMETRY instead of the P58D's — the thing this file exists to
 * prove is that every label element stays inside the *new* 50 × 25 mm
 * sticker too, not just the old 50 × 30 mm one. See label-print-config.ts
 * for why the TSPL geometry can safely reuse the P58D's content baselines
 * (the reachable width is identical; the band is the same height and was
 * already proven to fit on a shorter, 200-dot-tall label before).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLabelPlan, measureText } from "./label-layout";
import { TSPL_GEOMETRY } from "./label-print-config";

const LEFT = TSPL_GEOMETRY.printXDots;
const RIGHT = TSPL_GEOMETRY.printXDots + TSPL_GEOMETRY.printWDots;
const BAND_TOP = TSPL_GEOMETRY.printBandTopDots;
const BAND_BOTTOM = TSPL_GEOMETRY.printBandTopDots + TSPL_GEOMETRY.printBandHDots;

const SAMPLES = [
  { code: "SW000001", name: "UREA 50 KG", mrp: "1234.00", exp: "01/12/2026" },
  {
    code: "8901234567890",
    name: "TATA RALLIS ASATAF INSECTICIDE ACEPHATE 75% SP 500 GRAM POUCH",
    mrp: "18999.00",
    exp: "31/03/2027",
  },
  { code: "SKW-ABCDEF", name: "DAP", mrp: "0.00", exp: "" },
  { code: "SW999999", name: "SUPERPHOSPHATEGRANULARSINGLEBAGXXL", mrp: "9.50", exp: "" },
];

function textExtent(item: ReturnType<typeof buildLabelPlan>["texts"][number]) {
  const width = measureText(item.text, item.size, item.bold);
  if (item.anchor === "middle") return [item.x - width / 2, item.x + width / 2];
  if (item.anchor === "end") return [item.x - width, item.x];
  return [item.x, item.x + width];
}

describe("label plan on TSPL_GEOMETRY (50 x 25 mm)", () => {
  it("is exactly one 50 x 25 mm sticker", () => {
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields, TSPL_GEOMETRY);
      assert.equal(plan.widthDots, TSPL_GEOMETRY.labelWDots);
      assert.equal(plan.heightDots, TSPL_GEOMETRY.labelHDots);
    }
  });

  it("keeps every bar inside the printable window", () => {
    for (const fields of SAMPLES) {
      for (const bar of buildLabelPlan(fields, TSPL_GEOMETRY).bars) {
        assert.ok(bar.x >= LEFT, `${fields.code}: bar starts left of the head`);
        assert.ok(bar.x + bar.width <= RIGHT, `${fields.code}: bar runs past the head`);
      }
    }
  });

  it("keeps every text run inside the printable window", () => {
    for (const fields of SAMPLES) {
      for (const item of buildLabelPlan(fields, TSPL_GEOMETRY).texts) {
        const [start, end] = textExtent(item);
        assert.ok(start! >= LEFT - 0.5, `${fields.code}: "${item.text}" overflows left`);
        assert.ok(end! <= RIGHT + 0.5, `${fields.code}: "${item.text}" overflows right`);
      }
    }
  });

  it("keeps all ink inside the sticker's own height, with margin to spare", () => {
    // The whole point of the TSPL path: no gap-seek dead zone to crop
    // around, so the only real constraint is the sticker's own height —
    // 200 dots (25 mm) — not some assumed printable band inside it.
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields, TSPL_GEOMETRY);
      for (const bar of plan.bars) {
        assert.ok(bar.y >= 0, `${fields.code}: a bar starts above the sticker`);
        assert.ok(
          bar.y + bar.height <= TSPL_GEOMETRY.labelHDots,
          `${fields.code}: a bar runs past the bottom of the sticker`
        );
      }
      for (const item of plan.texts) {
        assert.ok(
          item.baseline - item.size * 0.75 >= 0,
          `${item.text} is above the sticker`
        );
        assert.ok(
          item.baseline + item.size * 0.25 <= TSPL_GEOMETRY.labelHDots,
          `${item.text} is below the sticker`
        );
      }
    }
  });

  it("keeps all ink inside the same reachable band as the P58D layout", () => {
    // Belt and suspenders: also check against the band the baselines were
    // actually designed for (168 dots inside a 200-dot label — even more
    // margin than the 200-dot P58D stock this band was proven on).
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields, TSPL_GEOMETRY);
      for (const bar of plan.bars) {
        assert.ok(bar.y >= BAND_TOP);
        assert.ok(bar.y + bar.height <= BAND_BOTTOM);
      }
      for (const item of plan.texts) {
        assert.ok(item.baseline - item.size * 0.75 >= BAND_TOP);
        assert.ok(item.baseline + item.size * 0.25 <= BAND_BOTTOM);
      }
    }
  });

  it("keeps the QR modules wide enough to scan", () => {
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields, TSPL_GEOMETRY);
      assert.ok(
        plan.barcode.moduleDots >= 3,
        `${fields.code}: QR module is ${plan.barcode.moduleDots} dots`
      );
    }
  });

  it("never drops the price or the code text", () => {
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields, TSPL_GEOMETRY);
      const texts = plan.texts.map((item) => item.text);
      assert.ok(plan.texts.some((t) => t.text === "MRP" && t.bold));
      assert.ok(texts.some((text) => text === ` : ${fields.mrp}`));
      assert.ok(texts.includes(fields.code));
    }
  });
});
