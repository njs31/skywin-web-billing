/**
 * POSiFLOW P58D 2-inch thermal label printer, 203 DPI.
 *
 * Media, measured off the roll on 2026-09-08 (50 × 25 mm stock — the earlier
 * 50 × 30 mm figures drove every print down the roll because the feed maths
 * over-fed ~7 mm a label):
 *
 *   liner width      54 mm
 *   sticker          50 mm wide × 24.5 mm tall, 2 mm liner each side
 *   gap between      3 mm
 *   pitch            27.9 mm   (measured over 10 stickers, not derived)
 *
 * 8 dots/mm keeps the artwork on the grid the head burns on, which avoids a
 * sub-dot drift down the label. 24.5 mm → 196 dots tall.
 */
export const DOTS_PER_MM = 8;

export const LABEL_W_MM = 50;
export const LABEL_H_MM = 24.5;

/** Backing paper width. The sticker is centred on it (2 mm each side). */
export const LINER_W_MM = 54;

/**
 * Liner gap between die-cut stickers, in mm. Only used for the blind-feed
 * fallback; the normal path seeks the gap with the sensor. Measure your roll
 * and change this if labels creep in blind mode.
 */
export const LABEL_GAP_MM = 3;

/**
 * Sticker to sticker. The single most important number: every "how far to the
 * next label" feed is derived from it. MEASURED over ten stickers, not
 * `LABEL_H_MM + LABEL_GAP_MM` — a 0.4 mm error here is what accumulates into a
 * whole sticker of drift over a run.
 */
export const LABEL_PITCH_MM = 27.9;

export const LABEL_W_DOTS = LABEL_W_MM * DOTS_PER_MM; // 400
export const LABEL_H_DOTS = Math.round(LABEL_H_MM * DOTS_PER_MM); // 196

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
 * Where the printer parks the paper after a `GS FF` gap seek, in mm from the
 * top of the sticker — i.e. the dead strip the head cannot reach.
 *
 * Corrected 2026-09-09 from a real run on the 24.5 mm stock: at 5 mm the whole
 * label was squeezed into the top third of the sticker with the masthead
 * clipped at the edge, so the true park is closer to 2 mm. If the artwork's top
 * edge still does not land ~2 mm down, print the test label (border + mm scale)
 * and nudge this by ±1.
 */
export const PRINT_TOP_OFFSET_MM = 2;
export const PRINT_TOP_OFFSET_DOTS = PRINT_TOP_OFFSET_MM * DOTS_PER_MM; // 16

/**
 * How much of the sticker is actually printed, in mm, starting at
 * PRINT_TOP_OFFSET_MM.
 *
 * 24.5 mm sticker − 2 mm dead top − ~2.5 mm the gap seek needs to re-find the
 * die cut ≈ 20 mm. Keeping the raster inside this leaves `GS FF` room to
 * re-register every label; overrunning it is what let the print walk off the
 * sticker after a few labels.
 */
export const PRINT_BAND_H_MM = 20;
export const PRINT_BAND_H_DOTS = PRINT_BAND_H_MM * DOTS_PER_MM; // 160

/** First and last artwork row the printer can actually burn. */
export const PRINT_BAND_TOP_DOTS = PRINT_TOP_OFFSET_DOTS; // 16
export const PRINT_BAND_BOTTOM_DOTS = PRINT_TOP_OFFSET_DOTS + PRINT_BAND_H_DOTS; // 176

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
/**
 * Layout, client design 2026-09-08:
 *
 *   SKYWIN BIOTECH            (bold, centred)
 *   (AGRI SUPER MARKET)       (regular, centred)
 *   <product name>            (left)          ┌──────────┐
 *   <code>            (left, large)           │    QR    │  code, on the right,
 *   EXP: <date>              (left)           │  square  │  square, spanning the
 *   RATE: <price>     (left, large)           └──────────┘  code..RATE rows
 *
 * No linear barcode any more — the QR is the only machine-readable mark.
 * Everything lives between PRINT_BAND_TOP_DOTS (40) and PRINT_BAND_BOTTOM_DOTS
 * (224), the only rows the head can reach. Every `*Baseline` is a text baseline.
 */
export const LABEL_LAYOUT = {
  /** The shop name is the masthead: centred, bold, the largest thing on it. */
  companyBaseline: 30,
  companySize: 15,
  /**
   * The tagline, in brackets, centred under the name. Regular weight, and small
   * enough to stay left of the QR column.
   */
  taglineBaseline: 43,
  taglineSize: 7,
  /**
   * Product name, one line, left-aligned, kept clear of the QR column and
   * clipped (not shrunk to nothing) when it is too long. Regular weight — bold
   * at this size blobs once thermal bleed closes the counters.
   */
  nameBaseline: 62,
  nameSize: 12,
  /** The product code in figures, left, large — the human-readable copy of the QR. */
  codeBaseline: 94,
  codeSize: 19,
  /** EXP and RATE are read across a counter, so they are the largest text. */
  expBaseline: 124,
  expSize: 12,
  rateBaseline: 158,
  rateSize: 18,
  /**
   * The QR square, in the right column. `qrTop` is its top edge (just below the
   * tagline); `qrMaxSize` is the box it is fitted into — the real QR is floored
   * to a whole-dot module, so a 21-module code comes out 126 dots (module 6 =
   * 0.75 mm). Right edge sits `qrRightInset` in from the content edge. Bottom
   * (48 + 126 = 174) stays inside PRINT_BAND_BOTTOM_DOTS (176).
   */
  qrTop: 48,
  qrMaxSize: 126,
  qrRightInset: 2,
} as const;

/** Lowest ink on the label. Must not reach PRINT_BAND_BOTTOM_DOTS. */
export const LABEL_INK_BOTTOM_DOTS = Math.max(
  LABEL_LAYOUT.rateBaseline + Math.ceil(LABEL_LAYOUT.rateSize * 0.25),
  LABEL_LAYOUT.qrTop + LABEL_LAYOUT.qrMaxSize
);

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
