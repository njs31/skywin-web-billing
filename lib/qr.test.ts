import test from "node:test";
import assert from "node:assert/strict";
import { layoutQrDots, QR_QUIET_MODULES } from "./qr";
import { buildLabelPlan } from "./label-layout";
import {
  LABEL_H_DOTS,
  LABEL_INK_BOTTOM_DOTS,
  LABEL_LAYOUT,
  LABEL_W_DOTS,
} from "./label-print-config";

const BOX = LABEL_LAYOUT.qrBoxDots;

test("layoutQrDots", async (t) => {
  await t.test("snaps modules to whole dots", () => {
    const qr = layoutQrDots("10000025", BOX);
    assert.equal(Number.isInteger(qr.moduleDots), true);
    assert.equal(qr.sizeDots, qr.moduleDots * qr.modules);
  });

  await t.test("gives a short product code 3 dots per module", () => {
    // 2 dots is small enough that thermal bleed closes the pattern up.
    assert.ok(
      layoutQrDots("10000025", BOX).moduleDots >= 3,
      "a version-1 symbol must clear the 2-dot floor"
    );
  });

  await t.test("budgets the mandatory quiet zone", () => {
    const qr = layoutQrDots("10000025", BOX);
    assert.equal(qr.quietDots, qr.moduleDots * QR_QUIET_MODULES);
    assert.ok(
      qr.sizeDots + qr.quietDots * 2 <= BOX,
      "symbol plus both quiet zones must fit the box"
    );
  });

  await t.test("never drops below the 2-dot floor", () => {
    assert.ok(layoutQrDots("A".repeat(200), 20).moduleDots >= 2);
  });

  await t.test("merges horizontal runs instead of emitting every module", () => {
    const qr = layoutQrDots("10000025", BOX);
    assert.ok(qr.bars.length > 0);
    assert.ok(
      qr.bars.length < qr.modules * qr.modules,
      "runs should collapse into fewer rects than raw modules"
    );
    assert.ok(qr.bars.every((b) => b.height === qr.moduleDots));
  });

  await t.test("keeps every module inside the symbol", () => {
    const qr = layoutQrDots("1000000712345", BOX);
    assert.ok(qr.bars.every((b) => b.x >= 0 && b.x + b.width <= qr.sizeDots));
    assert.ok(qr.bars.every((b) => b.y >= 0 && b.y + b.height <= qr.sizeDots));
  });

  await t.test("survives an empty code rather than throwing", () => {
    assert.ok(layoutQrDots("", BOX).bars.length > 0);
  });
});

test("label plan with QR", async (t) => {
  const plan = buildLabelPlan({
    code: "10000025",
    name: "BASK2 SILICONE BASKET GREEN 15 IN",
    mrp: "973.29",
    exp: "",
  });

  await t.test("keeps all ink inside the label", () => {
    assert.ok(LABEL_INK_BOTTOM_DOTS <= LABEL_H_DOTS);
    for (const bar of plan.bars) {
      assert.ok(bar.x >= 0 && bar.x + bar.width <= LABEL_W_DOTS, "bar within width");
      assert.ok(bar.y >= 0 && bar.y + bar.height <= LABEL_H_DOTS, "bar within height");
    }
  });

  await t.test("does not let the QR collide with the barcode", () => {
    assert.ok(
      plan.qr.y + plan.qr.sizeDots < plan.barcode.y,
      "the QR must clear the barcode band"
    );
  });

  await t.test("leaves the barcode its full width", () => {
    // Placing the QR beside the barcode would halve it and drop the module to
    // 2 dots, which is the scanning problem this change exists to fix.
    assert.ok(plan.barcode.moduleDots >= 3, "short codes keep a 3-dot module");
  });

  await t.test("keeps heading text clear of the QR", () => {
    const headings = plan.texts.filter((t) => t.baseline <= plan.qr.y + plan.qr.sizeDots);
    assert.ok(headings.length > 0, "there are headings beside the QR");
    assert.ok(
      headings.every((t) => t.x < plan.qr.x),
      "heading anchors sit left of the QR column"
    );
  });
});
