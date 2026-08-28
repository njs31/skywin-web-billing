/**
 * POSiFLOW 2-inch thermal label printer, 203 DPI.
 * Media: 50 × 25 mm die-cut direct-thermal labels on a gapped roll.
 *
 * TSPL reckons 8 dots/mm at "200 DPI", so the label is exactly 400 × 200
 * dots. Using 8 dots/mm rather than 203/25.4 keeps our raster on the same
 * grid the printer uses and avoids a sub-dot drift down the label.
 */
export const DOTS_PER_MM = 8;

export const LABEL_W_MM = 50;
export const LABEL_H_MM = 25;
/** Liner gap between die-cut labels. Drives the TSPL GAP command. */
export const LABEL_GAP_MM = 2;

export const LABEL_W_DOTS = LABEL_W_MM * DOTS_PER_MM; // 400
export const LABEL_H_DOTS = LABEL_H_MM * DOTS_PER_MM; // 200

/**
 * Dots the print head can actually burn. 2-inch heads are 384 dots (48 mm)
 * or 432 dots (54 mm) depending on the batch; 384 is the safe floor. We keep
 * every mark inside a 384-dot window centred on the 50 mm label, so the label
 * cannot be clipped or wrapped onto the next sticker on either head.
 */
export const PRINT_W_DOTS = 384;
export const PRINT_X_DOTS = (LABEL_W_DOTS - PRINT_W_DOTS) / 2; // 8

/** Margin inside the printable window. */
export const PAD_X_DOTS = 8;
export const CONTENT_X_DOTS = PRINT_X_DOTS + PAD_X_DOTS; // 16
export const CONTENT_W_DOTS = PRINT_W_DOTS - PAD_X_DOTS * 2; // 368

export const THERMAL_PRINTER_DPI = 203;
export const THERMAL_LABEL_SIZE_LABEL = "50 × 25 mm";

export function mmToDots(mm: number) {
  return Math.round(mm * DOTS_PER_MM);
}

/**
 * Vertical layout, in dots from the top of the label.
 *
 * Every `*Baseline` is a text baseline, because canvas, SVG and jsPDF all
 * position text by its baseline — sharing that one convention is what keeps
 * the on-screen preview, the downloaded PNG and the printed sticker identical.
 */
export const LABEL_LAYOUT = {
  companyBaseline: 20,
  companySize: 20,
  taglineBaseline: 33,
  taglineSize: 11,
  nameBaseline: 50,
  nameSize: 14,
  nameLineHeight: 16,
  nameLines: 2,
  barcodeY: 72,
  barcodeH: 68,
  codeBaseline: 154,
  codeSize: 12,
  footerBaseline: 177,
  expSize: 11,
  mrpSize: 16,
} as const;

/** Lowest ink on the label; the rest is bottom margin for die-cut drift. */
export const LABEL_INK_BOTTOM_DOTS =
  LABEL_LAYOUT.footerBaseline + Math.ceil(LABEL_LAYOUT.mrpSize * 0.25);

// Back-compat aliases for callers that still speak in pixels.
export const THERMAL_LABEL_W_MM = LABEL_W_MM;
export const THERMAL_LABEL_H_MM = LABEL_H_MM;
export const THERMAL_LABEL_W_PX = LABEL_W_DOTS;
export const THERMAL_LABEL_H_PX = LABEL_H_DOTS;
export const mmToPx = mmToDots;
