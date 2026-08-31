/**
 * The one place a 50 × 25 mm label is laid out.
 *
 * The browser preview (canvas), the downloaded PNG (sharp/SVG) and the PDF
 * sheet all render from this plan, so what the shopkeeper sees on screen is
 * exactly what the printer burns. Everything is in printer dots at 8 dots/mm.
 */
import { BUSINESS } from "@/lib/business";
import { layoutCode128Dots } from "@/lib/code128";
import { layoutQrDots } from "@/lib/qr";
import {
  CONTENT_W_DOTS,
  CONTENT_X_DOTS,
  LABEL_H_DOTS,
  LABEL_LAYOUT,
  LABEL_W_DOTS,
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
  qr: { moduleDots: number; modules: number; sizeDots: number; x: number; y: number };
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

  // The QR occupies the top-right; the heading text gets what is left of the
  // width, and is centred within that column rather than on the whole label.
  // qrY and qrBoxDots describe the box *including* the quiet zone, so the
  // symbol is inset by that margin on every side. A QR printed hard against
  // other ink will not be found at all.
  const qr = layoutQrDots(fields.code, L.qrBoxDots);
  const qrX = right - qr.quietDots - qr.sizeDots;
  const qrTop = L.qrY + qr.quietDots;
  const headWidth = qrX - qr.quietDots - L.qrGapDots - left;
  const headCentre = left + headWidth / 2;

  const company = fitToWidth(BUSINESS.name, L.companySize, true, headWidth);
  texts.push({
    text: company.text,
    x: headCentre,
    baseline: L.companyBaseline,
    size: company.size,
    bold: true,
    anchor: "middle",
  });

  const tagline = fitToWidth(BUSINESS.tagline, L.taglineSize, false, headWidth);
  texts.push({
    text: tagline.text,
    x: headCentre,
    baseline: L.taglineBaseline,
    size: tagline.size,
    bold: false,
    anchor: "middle",
  });

  const nameLines = wrapToLines(
    fields.name.toUpperCase(),
    L.nameSize,
    true,
    headWidth,
    L.nameLines
  );
  nameLines.forEach((line, index) => {
    const fitted = fitToWidth(line, L.nameSize, true, headWidth);
    texts.push({
      text: fitted.text,
      x: headCentre,
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
    bars: [
      ...bars.map((bar) => ({
        x: CONTENT_X_DOTS + bar.x,
        y: L.barcodeY,
        width: bar.width,
        height: L.barcodeH,
      })),
      ...qr.bars.map((bar) => ({
        x: qrX + bar.x,
        y: qrTop + bar.y,
        width: bar.width,
        height: bar.height,
      })),
    ],
    barcode: {
      moduleDots,
      totalDots,
      y: L.barcodeY,
      height: L.barcodeH,
    },
    qr: {
      moduleDots: qr.moduleDots,
      modules: qr.modules,
      sizeDots: qr.sizeDots,
      x: qrX,
      y: qrTop,
    },
  };
}
