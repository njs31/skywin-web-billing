import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLabelPlan, measureText } from "./label-layout";
import {
  LABEL_H_DOTS,
  LABEL_LAYOUT,
  LABEL_W_DOTS,
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

  it("keeps all ink inside the label height", () => {
    for (const fields of SAMPLES) {
      const plan = buildLabelPlan(fields);
      for (const bar of plan.bars) {
        assert.ok(bar.y >= 0 && bar.y + bar.height <= LABEL_H_DOTS);
      }
      for (const item of plan.texts) {
        // Helvetica ascends ~0.72 em above and descends ~0.21 em below baseline.
        assert.ok(item.baseline - item.size * 0.75 >= 0, `${item.text} clipped at top`);
        assert.ok(
          item.baseline + item.size * 0.25 <= LABEL_H_DOTS,
          `${item.text} clipped at bottom`
        );
      }
    }
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
