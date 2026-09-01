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

/**
 * Where the printer parks the paper after a `GS FF` gap seek, in mm.
 *
 * Measured from a print on 2026-09-01: the gap sensor stops the paper with the
 * head roughly 5 mm *past* the die cut, not level with it — the sensor sits
 * upstream of the head, so by the time the gap is detected the paper has run
 * on. Every label therefore starts 5 mm down the sticker, and the top 5 mm of
 * a sticker cannot be printed at all.
 *
 * This is a property of the printer, not of the design. Nothing in the layout
 * can recover that strip; what the layout must do is stop drawing before the
 * die cut at the other end, which is what PRINT_BAND_H_MM is for.
 */
export const PRINT_TOP_OFFSET_MM = 5;
export const PRINT_TOP_OFFSET_DOTS = PRINT_TOP_OFFSET_MM * DOTS_PER_MM; // 40

/**
 * How much of the sticker is actually printed, in mm.
 *
 * Starts at PRINT_TOP_OFFSET_MM and must end before the die cut, so this is
 * bounded by LABEL_H_MM - PRINT_TOP_OFFSET_MM = 25 mm. It is set 2 mm short of
 * that for two reasons: ink hard against a die cut smears on the edge, and the
 * raster must finish before the gap or `GS FF` has no travel left and skips a
 * whole sticker looking for the next one — which is what left every second
 * sticker blank.
 */
export const PRINT_BAND_H_MM = 23;
export const PRINT_BAND_H_DOTS = PRINT_BAND_H_MM * DOTS_PER_MM; // 184

/** First and last artwork row the printer can actually burn. */
export const PRINT_BAND_TOP_DOTS = PRINT_TOP_OFFSET_DOTS; // 40
export const PRINT_BAND_BOTTOM_DOTS = PRINT_TOP_OFFSET_DOTS + PRINT_BAND_H_DOTS; // 224

/**
 * Margin inside the printable window.
 *
 * 2 mm rather than 1: EXP and MRP sit in the bottom corners, and at 1 mm they
 * read as touching the sticker edge even when they are technically inside it.
 */
export const PAD_X_DOTS = 16;
export const CONTENT_X_DOTS = PRINT_X_DOTS + PAD_X_DOTS; // 24
export const CONTENT_W_DOTS = PRINT_W_DOTS - PAD_X_DOTS * 2; // 352

export const THERMAL_PRINTER_DPI = 203;
export const THERMAL_LABEL_SIZE_LABEL = "50 × 30 mm";

export function mmToDots(mm: number) {
  return Math.round(mm * DOTS_PER_MM);
}

/**
 * Vertical layout, in dots from the top of the **sticker** — not from the top
 * of the printed area.
 *
 * Everything lives between PRINT_BAND_TOP_DOTS (40) and PRINT_BAND_BOTTOM_DOTS
 * (224), because those are the only rows the printer can reach: it starts 5 mm
 * down the sticker after the gap seek, and must stop before the next die cut.
 * Using sticker coordinates rather than band coordinates means the preview, the
 * PNG and the PDF show the label where it physically lands, blank strip and
 * all, instead of a picture that only matches on screen.
 *
 * Every `*Baseline` is a text baseline, because canvas, SVG and jsPDF all
 * position text by its baseline — sharing that one convention is what keeps
 * the on-screen preview, the downloaded PNG and the printed sticker identical.
 */
export const LABEL_LAYOUT = {
  companyBaseline: 58,
  companySize: 16,
  taglineBaseline: 70,
  taglineSize: 9,
  nameBaseline: 86,
  nameSize: 12,
  nameLineHeight: 14,
  nameLines: 2,
  /**
   * The QR sits in the top-right, beside the heading rather than beside the
   * barcode. Putting it next to the barcode would halve the Code 128's width
   * and drop it to 2 dots per module, making the linear symbol harder to scan
   * — the opposite of the point. Here the barcode keeps the full label width.
   */
  qrY: 42,
  /**
   * Total box for the QR, quiet zone included. 87 dots is what a 21-module
   * version-1 symbol needs for 3 dots per module (21 + 8 quiet = 29, × 3).
   *
   * This was briefly 116 dots for a 4-dot module, on the assumption that a
   * 30 mm sticker had the room. It does not: only 23 mm of it can be printed,
   * and a 14.5 mm QR crowds the barcode out of the space it needs to stay
   * scannable. Three dots is the floor worth printing and it fits.
   */
  qrBoxDots: 87,
  /** Gap between the QR's quiet zone and the heading text column. */
  qrGapDots: 8,
  /** Below the QR's lower quiet zone, which ends at 129. */
  barcodeY: 132,
  /**
   * 56 dots is 7 mm. Shorter than one would like — a scanner wants enough bar
   * to sweep across without clipping the ends — but the printable band is
   * 23 mm and the QR, heading, code text and footer all have to fit inside it.
   * The QR is what carries a marginal read.
   */
  barcodeH: 56,
  codeBaseline: 199,
  codeSize: 9,
  footerBaseline: 220,
  expSize: 9,
  mrpSize: 12,
} as const;

/** Lowest ink on the label. Must not reach PRINT_BAND_BOTTOM_DOTS. */
export const LABEL_INK_BOTTOM_DOTS =
  LABEL_LAYOUT.footerBaseline + Math.ceil(LABEL_LAYOUT.mrpSize * 0.25);

/** Highest ink on the label. Must not rise above PRINT_BAND_TOP_DOTS. */
export const LABEL_INK_TOP_DOTS = Math.floor(
  Math.min(
    LABEL_LAYOUT.qrY,
    LABEL_LAYOUT.companyBaseline - LABEL_LAYOUT.companySize * 0.75
  )
);

// Back-compat aliases for callers that still speak in pixels.
export const THERMAL_LABEL_W_MM = LABEL_W_MM;
export const THERMAL_LABEL_H_MM = LABEL_H_MM;
export const THERMAL_LABEL_W_PX = LABEL_W_DOTS;
export const THERMAL_LABEL_H_PX = LABEL_H_DOTS;
export const mmToPx = mmToDots;
