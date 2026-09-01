/**
 * The one place a 50 × 30 mm label is laid out.
 *
 * The design is a single centred column: shop name, product name, barcode,
 * the code in figures, then EXP and MRP in the bottom corners. There is no QR
 * — it was removed on request, so the Code 128 is now the only machine-
 * readable mark and gets the full content width to keep its modules wide.
 *
 * The browser preview (canvas), the downloaded PNG (sharp/SVG) and the PDF
 * sheet all render from this plan, so what the shopkeeper sees on screen is
 * exactly what the printer burns. Everything is in printer dots at 8 dots/mm.
 */
import { BUSINESS } from "@/lib/business";
import { layoutCode128Dots } from "@/lib/code128";
import {
  CONTENT_W_DOTS,
  CONTENT_X_DOTS,
  LABEL_H_DOTS,
  LABEL_LAYOUT,
  LABEL_W_DOTS,
  DOTS_PER_MM,
  PRINT_BAND_H_DOTS,
  PRINT_BAND_TOP_DOTS,
  PRINT_W_DOTS,
  PRINT_X_DOTS,
} from "@/lib/label-print-config";

/**
 * Helvetica advance widths in 1/1000 em for ASCII 32..126, taken from the
 * core-font metrics jsPDF ships. Arial is metric-compatible with Helvetica,
 * so canvas and SVG break lines in the same places the PDF does.
 */
const WIDTHS_NORMAL = [
  280, 280, 350, 550, 550, 890, 660, 190, 330, 330, 390, 580, 280, 330, 280,
  280, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 280, 280, 580, 580,
  580, 550, 1010, 660, 660, 720, 720, 660, 610, 780, 720, 280, 500, 660, 550,
  830, 720, 780, 660, 780, 720, 660, 610, 720, 660, 940, 660, 660, 610, 280,
  280, 280, 470, 550, 330, 550, 550, 500, 550, 550, 280, 550, 550, 220, 220,
  500, 220, 830, 550, 550, 550, 550, 330, 500, 280, 550, 500, 720, 500, 500,
  500, 330, 260, 330, 580,
];
const WIDTHS_BOLD = [
  280, 330, 470, 550, 550, 890, 720, 240, 330, 330, 390, 580, 280, 330, 280,
  280, 550, 550, 550, 550, 550, 550, 550, 550, 550, 550, 330, 330, 580, 580,
  580, 610, 970, 720, 720, 720, 720, 660, 610, 780, 720, 280, 550, 720, 610,
  830, 720, 780, 660, 780, 720, 660, 610, 720, 660, 940, 660, 660, 610, 330,
  280, 330, 580, 550, 330, 550, 610, 550, 610, 550, 330, 610, 610, 280, 280,
  550, 280, 890, 610, 610, 610, 610, 390, 550, 330, 610, 550, 780, 550, 550,
  500, 390, 280, 390, 580,
];

/** Width of `text` in dots when set in Arial/Helvetica at `size` dots. */
export function measureText(text: string, size: number, bold = false) {
  const widths = bold ? WIDTHS_BOLD : WIDTHS_NORMAL;
  let mille = 0;
  for (const char of text) {
    const index = char.charCodeAt(0) - 32;
    mille += widths[index] ?? widths[63]!;
  }
  return (mille * size) / 1000;
}

export type LabelTextSpec = {
  text: string;
  /** Anchor x in dots; interpretation depends on `anchor`. */
  x: number;
  /** Text baseline in dots from the top of the label. */
  baseline: number;
  size: number;
  bold: boolean;
  anchor: "start" | "middle" | "end";
};

export type LabelBarSpec = { x: number; y: number; width: number; height: number };

export type LabelPlan = {
  widthDots: number;
  heightDots: number;
  texts: LabelTextSpec[];
  /**
   * Every black rectangle on the label: Code 128 bars and QR modules alike.
   * Renderers fill these without caring which is which, so the canvas preview,
   * the PNG export and the PDF sheet all pick up the QR unchanged.
   */
  bars: LabelBarSpec[];
  barcode: { moduleDots: number; totalDots: number; y: number; height: number };
};

export type LabelPlanFields = {
  code: string;
  name: string;
  mrp: string;
  exp: string;
};

/** Shrink until it fits, then clip with an ellipsis as a last resort. */
function fitToWidth(text: string, size: number, bold: boolean, maxWidth: number) {
  let fitted = size;
  while (fitted > 6 && measureText(text, fitted, bold) > maxWidth) {
    fitted -= 0.5;
  }
  if (measureText(text, fitted, bold) <= maxWidth) return { text, size: fitted };

  let clipped = text;
  while (clipped.length > 1 && measureText(`${clipped}…`, fitted, bold) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return { text: `${clipped}…`, size: fitted };
}

function wrapToLines(
  text: string,
  size: number,
  bold: boolean,
  maxWidth: number,
  maxLines: number
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (measureText(trial, size, bold) <= maxWidth) {
      current = trial;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length === 0) return [""];

  if (lines.length <= maxLines) return lines;
  // Too many lines: keep the first ones and fold the rest into the last.
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = lines.slice(maxLines - 1).join(" ");
  return kept;
}

/** Build the full drawing plan for one label. */
export function buildLabelPlan(fields: LabelPlanFields): LabelPlan {
  const L = LABEL_LAYOUT;
  const left = CONTENT_X_DOTS;
  const right = CONTENT_X_DOTS + CONTENT_W_DOTS;
  const centre = LABEL_W_DOTS / 2;
  const texts: LabelTextSpec[] = [];

  // Heading and product name both centre on the label itself. They used to
  // centre on a narrower column, because the QR occupied the top-right; with
  // the QR gone there is nothing to sit beside, and off-centre text under a
  // centred barcode reads as a mistake.
  const company = fitToWidth(BUSINESS.name, L.companySize, true, CONTENT_W_DOTS);
  texts.push({
    text: company.text,
    x: centre,
    baseline: L.companyBaseline,
    size: company.size,
    bold: true,
    anchor: "middle",
  });

  const nameLines = wrapToLines(
    fields.name.toUpperCase(),
    L.nameSize,
    true,
    CONTENT_W_DOTS,
    L.nameLines
  );
  nameLines.forEach((line, index) => {
    const fitted = fitToWidth(line, L.nameSize, true, CONTENT_W_DOTS);
    texts.push({
      text: fitted.text,
      x: centre,
      baseline: L.nameBaseline + index * L.nameLineHeight,
      size: fitted.size,
      bold: true,
      anchor: "middle",
    });
  });

  const { bars, moduleDots, totalDots } = layoutCode128Dots(
    fields.code,
    CONTENT_W_DOTS
  );

  const code = fitToWidth(fields.code, L.codeSize, true, CONTENT_W_DOTS);
  texts.push({
    text: code.text,
    x: centre,
    baseline: L.codeBaseline,
    size: code.size,
    bold: true,
    anchor: "middle",
  });

  // EXP and MRP share the footer line; MRP wins the space it needs.
  const mrpText = `MRP ${fields.mrp}`;
  const mrp = fitToWidth(mrpText, L.mrpSize, true, CONTENT_W_DOTS * 0.6);
  const expText = `EXP ${fields.exp || "—"}`;
  const expRoom = CONTENT_W_DOTS - measureText(mrp.text, mrp.size, true) - 8;
  const exp = fitToWidth(expText, L.expSize, false, Math.max(24, expRoom));

  texts.push({
    text: exp.text,
    x: left,
    baseline: L.footerBaseline,
    size: exp.size,
    bold: false,
    anchor: "start",
  });
  texts.push({
    text: mrp.text,
    x: right,
    baseline: L.footerBaseline,
    size: mrp.size,
    bold: true,
    anchor: "end",
  });

  return {
    widthDots: LABEL_W_DOTS,
    heightDots: LABEL_H_DOTS,
    texts,
    bars: bars.map((bar) => ({
      x: CONTENT_X_DOTS + bar.x,
      y: L.barcodeY,
      width: bar.width,
      height: L.barcodeH,
    })),
    barcode: {
      moduleDots,
      totalDots,
      y: L.barcodeY,
      height: L.barcodeH,
    },
  };
}

/**
 * Data for the diagnostic label. Deliberately a real-looking product: it goes
 * through `buildLabelPlan` unchanged, so a test print exercises the same
 * layout, barcode and QR code path a product does. A test that prints
 * something special proves nothing about the labels you actually sell.
 */
export const TEST_LABEL_FIELDS: LabelPlanFields = {
  code: "8901234567890",
  name: "TEST LABEL",
  mrp: "40.00",
  exp: "",
};

/** Border thickness for the test label, in dots. */
const TEST_BORDER_DOTS = 2;

/**
 * The test label: the real plan, a border on the edge of the printable band,
 * and a millimetre scale down the left side.
 *
 * The border shows registration at a glance — a rectangle either lands inside
 * the die cut or it does not, and whichever edge is clipped says which way the
 * paper is out. The scale exists because the one thing we cannot print is the
 * strip above PRINT_BAND_TOP_DOTS, so the only way to measure that offset is
 * against something of known size in the same photograph. Ticks are 1 mm, with
 * a long tick and a number every 5 mm.
 */
export function buildTestLabelPlan(): LabelPlan {
  const plan = buildLabelPlan(TEST_LABEL_FIELDS);
  const t = TEST_BORDER_DOTS;
  const x = PRINT_X_DOTS;
  const w = PRINT_W_DOTS;
  const top = PRINT_BAND_TOP_DOTS;
  const h = PRINT_BAND_H_DOTS;

  const bars: LabelBarSpec[] = [
    ...plan.bars,
    { x, y: top, width: w, height: t },
    { x, y: top + h - t, width: w, height: t },
    { x, y: top, width: t, height: h },
    { x: x + w - t, y: top, width: t, height: h },
  ];

  const texts: LabelTextSpec[] = [...plan.texts];
  for (let mm = 0; mm * DOTS_PER_MM <= h; mm++) {
    const y = top + mm * DOTS_PER_MM;
    const major = mm % 5 === 0;
    bars.push({ x: x + t, y, width: major ? 12 : 6, height: 1 });
    if (major && mm > 0) {
      texts.push({
        text: String(mm),
        x: x + t + 15,
        baseline: y + 3,
        size: 7,
        bold: false,
        anchor: "start",
      });
    }
  }

  return { ...plan, bars, texts };
}
