/**
 * POSiFLOW P58D 2-inch thermal label printer, 203 DPI.
 *
 * Media, switched back to 50 × 30 mm stock on 2026-09-24 (a *different* roll
 * from the 50 × 24.5 mm one measured on 2026-09-08 — that earlier change was
 * this same printer on a shorter sticker, not a mistake being reverted):
 *
 *   liner width      54 mm                     (unchanged — same liner)
 *   sticker          50 mm wide × 30 mm tall, 2 mm liner each side
 *   gap between      3 mm                       ASSUMED, not measured
 *   pitch            33 mm  (= height + gap)     ASSUMED, not measured
 *
 * The pitch is what "how far to the next label" is derived from, and on the
 * last roll a derived-not-measured pitch was off by 0.4 mm/label, which
 * accumulated into a whole sticker of drift over a run (see git history,
 * 2026-09-08). That failure mode only bites the blind-feed fallback though —
 * the normal path seeks the die cut with the printer's own gap sensor
 * (`GS FF` in escpos-print.ts) and re-registers on every label regardless of
 * this constant. Still: measure the real pitch over 10 stickers with a ruler
 * once the printer is back on hand, the same way the last roll was measured,
 * and correct LABEL_PITCH_MM (and LABEL_GAP_MM if the gap differs) then.
 *
 * 8 dots/mm keeps the artwork on the grid the head burns on, which avoids a
 * sub-dot drift down the label. 30 mm → 240 dots tall.
 */
export const DOTS_PER_MM = 8;

export const LABEL_W_MM = 50;
export const LABEL_H_MM = 30;

/** Backing paper width. The sticker is centred on it (2 mm each side). */
export const LINER_W_MM = 54;

/**
 * Liner gap between die-cut stickers, in mm. Only used for the blind-feed
 * fallback; the normal path seeks the gap with the sensor. Measure your roll
 * and change this if labels creep in blind mode. ASSUMED at 3 mm (same as
 * the previous roll) — not yet measured against this stock.
 */
export const LABEL_GAP_MM = 3;

/**
 * Sticker to sticker. The single most important number for the blind-feed
 * fallback: every "how far to the next label" feed in that mode is derived
 * from it (the normal, sensor-seeking path does not depend on this being
 * exact). ASSUMED as `LABEL_H_MM + LABEL_GAP_MM` for now, not measured —
 * see the file header. MEASURE over ten stickers once the printer is back,
 * the same way the previous roll's 27.9 mm figure was pinned down, and
 * replace this literal rather than trusting the derivation.
 */
export const LABEL_PITCH_MM = 33;

export const LABEL_W_DOTS = LABEL_W_MM * DOTS_PER_MM; // 400
export const LABEL_H_DOTS = Math.round(LABEL_H_MM * DOTS_PER_MM); // 240

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
 * clipped at the edge, so the true park is closer to 2 mm. Carried over
 * unverified to the 30 mm stock (2026-09-24) — the park is how far the gap
 * seek stops past the die cut, which is a property of the sensor/mechanism,
 * not of the sticker height, so it should not need to change. If the
 * artwork's top edge still does not land ~2 mm down, print the test label
 * (border + mm scale) and nudge this by ±1.
 */
export const PRINT_TOP_OFFSET_MM = 2;
export const PRINT_TOP_OFFSET_DOTS = PRINT_TOP_OFFSET_MM * DOTS_PER_MM; // 16

/**
 * How much of the sticker is used for artwork, in mm, starting at
 * PRINT_TOP_OFFSET_MM.
 *
 * 20 mm of the sticker — the labels are now printed as a PDF through the
 * POSiFLOW app, which drives the media itself, so this no longer has to
 * leave the extra gap-seek margin the direct ESC/POS path needed. Left
 * unchanged on the 30 mm stock (2026-09-24): it already ended 2.5 mm short
 * of the die cut on the shorter 24.5 mm roll, so on 30 mm stock the same
 * band now ends 8 mm short — strictly safer, not tighter — for both the PDF
 * and the direct ESC/POS path.
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
   * `qrMaxSize` is the box it is fitted into — floored to a whole-dot module.
   * Shrunk ~1.5× on request (110 → 73) because the printed code was crowding
   * the label: a 21-module code now floors to module 3 (0.375 mm) → 63 dots
   * (~8 mm), down from module 5 → 105 dots. Bottom (62 + 63 = 125) still sits
   * well inside the 20 mm band. Right edge sits `qrRightInset` in from the
   * content edge.
   */
  qrTop: 62,
  qrMaxSize: 73,
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
