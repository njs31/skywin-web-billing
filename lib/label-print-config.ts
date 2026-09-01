/**
 * POSiFLOW P58D 2-inch thermal label printer, 203 DPI.
 *
 * Media, measured off the roll on 2026-09-01:
 *
 *   liner width      55 mm
 *   sticker          50 × 30 mm, centred on the liner (2.5 mm each side)
 *   gap between      4 mm
 *   pitch            34 mm  (sticker + gap)
 *
 * 8 dots/mm makes the label exactly 400 × 240 dots. Using 8 rather than
 * 203/25.4 keeps the artwork on the same grid the head burns on, which avoids
 * a sub-dot drift down the label.
 */
export const DOTS_PER_MM = 8;

export const LABEL_W_MM = 50;
export const LABEL_H_MM = 30;

/** Backing paper width. The sticker is centred on it. */
export const LINER_W_MM = 55;

/**
 * Liner gap between die-cut stickers, in mm. Measure your roll and change this
 * if labels creep: the printer is fed the image (exactly LABEL_H_MM) and then
 * this gap, so image + gap must equal the sticker pitch. Feeding more than the
 * pitch makes every label drift further down the roll than the last; feeding
 * less walks it up, which is the "half a QR after the gap" symptom.
 */
export const LABEL_GAP_MM = 4;

/** Sticker to sticker. The paper must advance exactly this per label. */
export const LABEL_PITCH_MM = LABEL_H_MM + LABEL_GAP_MM; // 34

export const LABEL_W_DOTS = LABEL_W_MM * DOTS_PER_MM; // 400
export const LABEL_H_DOTS = LABEL_H_MM * DOTS_PER_MM; // 240

/**
 * Dots the print head can actually burn. 2-inch heads are 384 dots (48 mm)
 * or 432 dots (54 mm) depending on the batch; 384 is the safe floor. We keep
 * every mark inside a 384-dot window centred on the 50 mm label, so the label
 * cannot be clipped or wrapped onto the next sticker on either head.
 *
 * That centring is also what the paper path gives us: a 48 mm head centred on
 * the 55 mm liner reaches from 3.5 mm to 51.5 mm across the paper, and the
 * sticker runs 2.5 mm to 52.5 mm — 1 mm of unreachable sticker on each side,
 * which is exactly PRINT_X_DOTS.
 */
export const PRINT_W_DOTS = 384;
export const PRINT_X_DOTS = (LABEL_W_DOTS - PRINT_W_DOTS) / 2; // 8

/**
 * Page size to ask a print driver for, in mm.
 *
 * Not the 50 mm of the sticker: a 384-dot head can only burn 48 mm. Asking for
 * the full 50 mm makes CUPS either scale the page or clip its right edge,
 * which shifts the barcode off-centre. Printing the 48 mm printable window
 * instead loses nothing, because every mark already sits inside it.
 */
export const DRIVER_PAGE_W_MM = PRINT_W_DOTS / DOTS_PER_MM; // 48
export const DRIVER_PAGE_H_MM = LABEL_H_MM;

/** Margin inside the printable window. */
export const PAD_X_DOTS = 8;
export const CONTENT_X_DOTS = PRINT_X_DOTS + PAD_X_DOTS; // 16
export const CONTENT_W_DOTS = PRINT_W_DOTS - PAD_X_DOTS * 2; // 368

export const THERMAL_PRINTER_DPI = 203;
export const THERMAL_LABEL_SIZE_LABEL = "50 × 30 mm";

export function mmToDots(mm: number) {
  return Math.round(mm * DOTS_PER_MM);
}

/**
 * Vertical layout, in dots from the top of the label. The label is 240 dots
 * tall and the plan fills it: heading and QR share the top band, the Code 128
 * takes the middle, and the code text and footer close it out just above the
 * die cut.
 *
 * Every `*Baseline` is a text baseline, because canvas, SVG and jsPDF all
 * position text by its baseline — sharing that one convention is what keeps
 * the on-screen preview, the downloaded PNG and the printed sticker identical.
 */
export const LABEL_LAYOUT = {
  companyBaseline: 22,
  companySize: 20,
  taglineBaseline: 35,
  taglineSize: 10,
  nameBaseline: 55,
  nameSize: 14,
  nameLineHeight: 17,
  /**
   * Three lines, not two: on a 30 mm sticker the heading column has room
   * beside the QR, and a 60-character agro-chemical name folded into two
   * lines gets shrunk far enough to be hard to read.
   */
  nameLines: 3,
  /**
   * The QR sits in the top-right, beside the heading rather than beside the
   * barcode. Putting it next to the barcode would halve the Code 128's width
   * and drop it to 2 dots per module, making the linear symbol harder to scan
   * — the opposite of the point. Here the barcode keeps the full label width.
   */
  qrY: 4,
  /**
   * Total box for the QR, quiet zone included. 116 dots gets a 21-module
   * version-1 symbol 4 dots per module (21 + 8 quiet = 29, × 4): a 10.5 mm
   * symbol with 0.5 mm modules, which the 25 mm sticker could not afford. A
   * code long enough to force version 2 falls back to 3 dots and still clears
   * the floor where thermal bleed closes the pattern up.
   */
  qrBoxDots: 116,
  /** Gap between the QR's quiet zone and the heading text column. */
  qrGapDots: 8,
  /**
   * Starts below the QR's lower quiet zone (symbol ends at 104, quiet zone at
   * 120) — the barcode spans the full width, so it would otherwise crowd the
   * margin the QR needs to be found at all.
   */
  barcodeY: 120,
  /**
   * 84 dots is 10.5 mm. Taller is better — a handheld scanner needs enough bar
   * to sweep across without clipping the ends — and the extra 5 mm of sticker
   * goes here and into the QR before anywhere else.
   */
  barcodeH: 84,
  codeBaseline: 215,
  codeSize: 10,
  footerBaseline: 233,
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
