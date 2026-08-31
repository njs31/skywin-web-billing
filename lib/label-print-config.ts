/**
 * POSiFLOW P58D 2-inch thermal label printer, 203 DPI.
 * Media: 50 × 25 mm die-cut direct-thermal labels on a gapped roll.
 *
 * 8 dots/mm makes the label exactly 400 × 200 dots. Using 8 rather than
 * 203/25.4 keeps the artwork on the same grid the head burns on, which avoids
 * a sub-dot drift down the label.
 */
export const DOTS_PER_MM = 8;

export const LABEL_W_MM = 50;
export const LABEL_H_MM = 25;

/**
 * Liner gap between die-cut stickers, in mm. Measure your roll and change this
 * if labels creep: the printer is fed the image (exactly LABEL_H_MM) and then
 * this gap, so image + gap must equal the sticker pitch. Feeding more than the
 * pitch makes every label drift further down the roll than the last.
 */
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

/**
 * Page size to ask a print driver for, in mm.
 *
 * Not the 50 mm of the sticker: a 384-dot head can only burn 48 mm, and the
 * POS58 queue's die-cut media is 48 × 25 mm. Asking for the full 50 mm makes
 * CUPS either scale the page or clip its right edge, which shifts the barcode
 * off-centre. Printing the 48 mm printable window instead loses nothing,
 * because every mark already sits inside it.
 */
export const DRIVER_PAGE_W_MM = PRINT_W_DOTS / DOTS_PER_MM; // 48
export const DRIVER_PAGE_H_MM = LABEL_H_MM;

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
  companyBaseline: 18,
  companySize: 16,
  taglineBaseline: 30,
  taglineSize: 9,
  nameBaseline: 46,
  nameSize: 13,
  nameLineHeight: 15,
  nameLines: 2,
  /**
   * The QR sits in the top-right, beside the heading rather than beside the
   * barcode. Putting it next to the barcode would halve the Code 128's width
   * and drop it to 2 dots per module, making the linear symbol harder to scan
   * — the opposite of the point. Here the barcode keeps the full label width.
   */
  qrY: 2,
  /**
   * Total box for the QR, quiet zone included. 87 dots is what a 21-module
   * version-1 symbol needs to get 3 dots per module (21 + 8 quiet = 29, × 3),
   * giving a 7.9 mm symbol with 0.375 mm modules. Two dots per module is small
   * enough that thermal bleed closes the pattern up, so this is the floor
   * worth printing. A code long enough to force version 2 falls back to 2 dots
   * and prints smaller — keep product codes short.
   */
  qrBoxDots: 87,
  /** Gap between the QR's quiet zone and the heading text column. */
  qrGapDots: 8,
  barcodeY: 92,
  /**
   * 72 dots is 9 mm. Taller is better — a handheld scanner needs enough bar to
   * sweep across without clipping the ends — but the QR band above and the
   * footer below cap it here. The QR is what makes a marginal read succeed;
   * this is as much height as the remaining space honestly allows.
   */
  barcodeH: 72,
  codeBaseline: 176,
  codeSize: 10,
  footerBaseline: 194,
  expSize: 10,
  mrpSize: 14,
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
