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
 * Where the head's first dot lands, measured from the sticker's left edge.
 *
 * Measured on 2026-09-02, not derived. The layout puts MRP's right edge 3 mm
 * in from the sticker, and on paper it printed hard against the edge with a
 * correspondingly wide gap on the left — so the artwork was landing 3 mm
 * further right than intended, and the head starts at 4 mm rather than the
 * 1 mm this file used to assume.
 *
 * The old assumption was that a 48 mm head sits centred on the 55 mm liner.
 * It does not: starting at 4 mm it reaches to 52 mm, past the sticker's right
 * edge at 50 mm, so the last 2 mm of the head hangs off the label entirely.
 * The paper evidently rides to one side of the paper path.
 */
export const PRINT_X_DOTS = 32; // 4 mm

/**
 * Dots of the head that actually fall on the sticker.
 *
 * The head itself is 384 dots (48 mm), but only the ones between
 * PRINT_X_DOTS and the sticker's right edge land on anything worth printing,
 * so that is all the raster carries. The rest of the head burns nothing.
 */
export const PRINT_W_DOTS = LABEL_W_DOTS - PRINT_X_DOTS; // 368

/**
 * Page size to ask a print driver for, in mm.
 *
 * Not the 50 mm of the sticker: the head reaches only part of it. Asking for
 * the full 50 mm makes CUPS either scale the page or clip its right edge,
 * which shifts the barcode off-centre. Printing the reachable window instead
 * loses nothing, because every mark already sits inside it.
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
 * Starts at PRINT_TOP_OFFSET_MM. Geometry alone would allow 25 mm, but the
 * printer stops burning before then: measured on 2026-09-01, ink at sticker
 * rows 175..181 printed and ink at rows 199..207 — EXP and MRP — did not,
 * while being present in the raster the printer was sent. So the head goes
 * dead somewhere around 23-25 mm down the sticker, roughly mirroring the 5 mm
 * dead zone at the top, which is what a sensor offset from the head would do
 * at both ends.
 *
 * 18 mm keeps every mark inside the region that demonstrably burns, with the
 * lowest ink at row 179 against the last row known to print, 181. It is
 * deliberately conservative: the exact cut-off has not been measured, only
 * bracketed between rows 181 and 199. The test label's millimetre scale is
 * what will pin it down, and this can then be opened back up.
 *
 * It also has to finish before the gap regardless, or `GS FF` has no travel
 * left and skips a whole sticker hunting the next one — which is what left
 * every second sticker blank.
 */
export const PRINT_BAND_H_MM = 18;
export const PRINT_BAND_H_DOTS = PRINT_BAND_H_MM * DOTS_PER_MM; // 144

/** First and last artwork row the printer can actually burn. */
export const PRINT_BAND_TOP_DOTS = PRINT_TOP_OFFSET_DOTS; // 40
export const PRINT_BAND_BOTTOM_DOTS = PRINT_TOP_OFFSET_DOTS + PRINT_BAND_H_DOTS; // 224

/**
 * The column the content occupies, centred on the sticker.
 *
 * Centred on the *sticker*, not on the printable window, or the label reads as
 * lopsided however neat the numbers are. The head cannot reach the first 4 mm,
 * so a centred block can be at most 50 - 2 x 4 = 42 mm wide, and its own left
 * edge lands exactly where the head starts.
 *
 * That leaves a 4 mm blank margin either side: unreachable paper on the left,
 * deliberate margin on the right. There is no room for more — at 40 mm the
 * Code 128 for a long code drops to one dot per module, which thermal bleed
 * closes up.
 */
export const CONTENT_X_DOTS = PRINT_X_DOTS; // 32
export const CONTENT_W_DOTS = LABEL_W_DOTS - PRINT_X_DOTS * 2; // 336

/**
 * Anything darker than this becomes a burnt dot when the artwork is packed
 * to 1 bit. Grey 0-255, so a higher number keeps more of the anti-aliased
 * edge of a glyph.
 *
 * It was 160, and that was thinning the text: a small glyph's stroke is about
 * one dot wide and renders as grey rather than black, so much of it fell under
 * the threshold and printed broken. Barcode bars are drawn on exact dot
 * boundaries with no anti-aliasing, so raising this does not touch them —
 * measured across the whole label, 160 to 200 adds 4% more ink and all of it
 * is text.
 *
 * Both renderers must use this. The browser packs from a canvas and the server
 * from an SVG, and a label printed on the phone has to match one printed in
 * the shop.
 */
export const INK_THRESHOLD = 200;

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
  /** The shop name is the masthead: centred, and the largest thing on it. */
  companyBaseline: 56,
  companySize: 18,
  /**
   * Product name, centred under the masthead.
   *
   * Regular weight, like everything below the masthead. Bold at this size
   * prints as a blob: a bold stroke is two dots, thermal bleed spreads each
   * one, and the counters close up — the shop could see the text and not read
   * it. Lighter and a dot larger reads better than heavier and smaller.
   */
  nameBaseline: 76,
  nameSize: 13,
  nameLineHeight: 14,
  nameLines: 2,
  /**
   * The barcode is centred by layoutCode128Dots inside the content column and
   * takes whatever whole-dot module width fits, so its width varies with the
   * length of the code. That is deliberate — module width is what decides
   * whether a scanner can read it, so it gets first claim on the space.
   */
  barcodeY: 98,
  /**
   * 48 dots is 6 mm. Shorter than one would like, and shorter than it was:
   * the printable band lost 5 mm when it turned out the head stops burning
   * before the die cut, and the barcode is what had the height to give.
   */
  barcodeH: 48,
  codeBaseline: 158,
  codeSize: 10,
  footerBaseline: 176,
  expSize: 11,
  mrpSize: 12,
} as const;

/** Lowest ink on the label. Must not reach PRINT_BAND_BOTTOM_DOTS. */
export const LABEL_INK_BOTTOM_DOTS =
  LABEL_LAYOUT.footerBaseline + Math.ceil(LABEL_LAYOUT.mrpSize * 0.25);

/** Highest ink on the label. Must not rise above PRINT_BAND_TOP_DOTS. */
export const LABEL_INK_TOP_DOTS = Math.floor(
  LABEL_LAYOUT.companyBaseline - LABEL_LAYOUT.companySize * 0.75
);

// Back-compat aliases for callers that still speak in pixels.
export const THERMAL_LABEL_W_MM = LABEL_W_MM;
export const THERMAL_LABEL_H_MM = LABEL_H_MM;
export const THERMAL_LABEL_W_PX = LABEL_W_DOTS;
export const THERMAL_LABEL_H_PX = LABEL_H_DOTS;
export const mmToPx = mmToDots;
