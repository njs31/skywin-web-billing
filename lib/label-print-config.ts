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
 * Left inset of the raster on the canvas, in dots.
 *
 * On the 24.5 mm stock the print landed ~4 mm LEFT of centre — text clipped off
 * the left edge, wide blank on the right — the opposite of the 30 mm roll. So
 * the raster now starts near the canvas's own left edge (1 mm) and the CONTENT
 * column below is pushed well in from there. The head is 384 dots (48 mm), so
 * that is the raster width.
 *
 * NOT yet dialled in against a ruler — the left / right blank margins on a real
 * print pin the true head origin, and this plus CONTENT_X_DOTS follow from it.
 */
export const PRINT_X_DOTS = 8; // 1 mm

/** The reachable head width, 384 dots (48 mm). */
export const PRINT_W_DOTS = LABEL_W_DOTS - PRINT_X_DOTS * 2; // 384

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
 * How much of the sticker is used for artwork, in mm, starting at
 * PRINT_TOP_OFFSET_MM.
 *
 * 20 mm of the 24.5 mm sticker — the labels are now printed as a PDF through
 * the POSiFLOW app, which drives the media itself, so this no longer has to
 * leave the extra gap-seek margin the direct ESC/POS path needed. Still ends
 * 2.5 mm before the die cut so the direct path keeps working too.
 */
export const PRINT_BAND_H_MM = 20;
export const PRINT_BAND_H_DOTS = PRINT_BAND_H_MM * DOTS_PER_MM; // 160

/** First and last artwork row the printer can actually burn. */
export const PRINT_BAND_TOP_DOTS = PRINT_TOP_OFFSET_DOTS; // 16
export const PRINT_BAND_BOTTOM_DOTS = PRINT_TOP_OFFSET_DOTS + PRINT_BAND_H_DOTS; // 160

/**
 * The column the content occupies — a conservative safe zone.
 *
 * The head prints a few mm left of where the geometry says and its exact
 * position cannot be measured (printer is off-site). 60 dots (7.5 mm) in on the
 * left and 44 dots (5.5 mm) before the canvas edge on the right keeps every mark
 * on the 50 mm sticker for any head offset in roughly ±3 mm — at the cost of a
 * wider white border. Tighten only once a real print can be checked.
 */
export const CONTENT_X_DOTS = 60;
export const CONTENT_W_DOTS = LABEL_W_DOTS - CONTENT_X_DOTS - 44; // 296

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
  companyBaseline: 38,
  companySize: 18,
  /**
   * The tagline, in brackets, centred under the name. Regular weight, roughly
   * two-thirds the masthead — the shop's approved sample has it prominent.
   */
  taglineBaseline: 60,
  taglineSize: 12,
  /**
   * Product name, one line, left-aligned, kept clear of the QR column and
   * clipped (not shrunk to nothing) when it is too long.
   */
  nameBaseline: 84,
  nameSize: 12,
  /** The product code in figures, left, large — the human-readable copy of the QR. */
  codeBaseline: 110,
  codeSize: 19,
  /** EXP and MRP are read across a counter, so they are large. */
  expBaseline: 138,
  expSize: 15,
  /**
   * "MRP" prints bold, the value regular; see buildLabelPlan. Sized up on
   * request so the price reads clearly across the counter — both the "MRP"
   * label and its value share this size. Baseline + 0.25 em stays inside
   * PRINT_BAND_BOTTOM_DOTS (176), so the line still clears the die cut.
   */
  mrpBaseline: 168,
  mrpSize: 24,
  /**
   * The QR square, right column, vertically centred against the text block.
   * `qrMaxSize` is the box it is fitted into — floored to a whole-dot module,
   * so a 21-module code comes out 105 dots (module 5 = 0.625 mm, ~13 mm).
   * Bottom (62 + 105 = 167) sits inside the 20 mm band. Right edge sits
   * `qrRightInset` in from the content edge.
   */
  qrTop: 62,
  qrMaxSize: 110,
  qrRightInset: 4,
} as const;

/** Lowest ink on the label. Must not reach PRINT_BAND_BOTTOM_DOTS. */
export const LABEL_INK_BOTTOM_DOTS = Math.max(
  LABEL_LAYOUT.mrpBaseline + Math.ceil(LABEL_LAYOUT.mrpSize * 0.25),
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
