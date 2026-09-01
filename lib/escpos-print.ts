/**
 * ESC/POS job builder for the POSiFLOW P58D label printer.
 *
 * Why ESC/POS and not TSPL: the P58D does not implement TSPL at all. Sent TSPL
 * it prints the command text verbatim ("SIZE 50 mm,30 mm", "GAP...") and feeds
 * the roll — the long-standing "it prints source code" bug. It also ignores the
 * Caysn vendor raster opcode (0x1a 0x5b) that the macOS CLA58/POS58L drivers
 * emit: those jobs complete cleanly and print nothing.
 *
 * What it does implement is plain ESC/POS `GS v 0`, and it will only accept the
 * image in narrow horizontal bands. This byte layout was recovered from the
 * vendor's own macOS POS58 driver (`cprastertocmd`) after confirming that queue
 * prints a correct label, and is reproduced here exactly so the app can print
 * with no driver installed on the machine at all.
 */
import type { LabelRaster } from "@/lib/label-render";
import {
  DOTS_PER_MM,
  LABEL_PITCH_MM,
  PRINT_BAND_H_MM,
} from "@/lib/label-print-config";

/** One sticker pitch in dots. What a gap seek covers from a parked position. */
const PITCH_DOTS = Math.round(LABEL_PITCH_MM * DOTS_PER_MM); // 272

/**
 * Rows per `GS v 0` block. The printer's input buffer will not take a whole
 * label in one command — that is why an earlier single-block attempt
 * produced nothing — and 24 is what the vendor driver uses.
 */
export const BAND_ROWS = 24;

/**
 * Zero bytes sent before the first band. The vendor driver leads with these;
 * a battery printer that has idled drops the first bytes it receives, so this
 * absorbs that rather than losing the top of the label.
 */
const LEAD_IN_BYTES = 64;

/**
 * Feed to the next die cut, using the printer's own gap sensor.
 *
 * `GS FF` (1d 0c) — "print and feed label to the peeling position". Verified on
 * the P58D on 2026-09-01: sent after a line of text it advances the paper until
 * the sensor sees the gap and stops at the top of the next sticker. Plain `FF`
 * (0c) does not, and the sensor needs no `ESC c 4` selection first.
 *
 * This is what keeps a run registered. A blind `ESC J` feed cannot: the printer
 * advances exactly the dots it is told, so any error between the fed distance
 * and the true sticker pitch repeats on every label and accumulates until the
 * artwork straddles a die cut. `GS FF` measures instead of counting, so a label
 * that starts out of position is corrected by the next one rather than dragging
 * the whole run out of registration. It also leaves the paper parked at the top
 * of a sticker, so the *next* job starts registered too.
 */
const GAP_SEEK = Uint8Array.from([0x1d, 0x0c]);

/**
 * How far to feed after each label when counting dots instead, in dots.
 *
 * Only used when `endOfLabel` is "feed" — a roll with no gap for the sensor to
 * find, or a printer that lacks one. Then image + feed must equal the sticker
 * pitch exactly: the raster is PRINT_BAND_H_MM tall (23 mm), so this is the
 * remaining 11 mm. Get it wrong in either direction and the error repeats on
 * every label until the artwork straddles a die cut — the vendor driver's
 * 80-dot tear-off feed walks it down the roll, a short feed walks it up.
 */
export const DEFAULT_FEED_DOTS = Math.round(
  (LABEL_PITCH_MM - PRINT_BAND_H_MM) * DOTS_PER_MM
); // 88

export type EscPosOptions = {
  /** Copies of each label. */
  copies?: number;
  /**
   * Push the last label clear of the tear bar when the job ends. Default on.
   */
  present?: boolean;
  /**
   * How a label ends. "gap" lets the printer find the die cut itself and is
   * what die-cut stock wants; "feed" counts out `feedDots` blindly.
   */
  endOfLabel?: "gap" | "feed";
  /**
   * Liner gap to feed after each label, in dots. Implies "feed" — passing an
   * explicit gap is how a caller says the sensor cannot be used.
   */
  feedDots?: number;
};

function resolveFeed(feedDots?: number) {
  const dots = Math.trunc(feedDots ?? DEFAULT_FEED_DOTS);
  // ESC J takes a single byte.
  return Math.max(0, Math.min(255, dots));
}

export function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * One `GS v 0` raster block: `1d 76 30 m xL xH yL yH` then the packed rows.
 * Mode 0 is normal density. A 1 bit burns a dot, which is the opposite of
 * TSPL — no inversion here, unlike the code this replaces.
 */
export function buildRasterBand(
  bytesPerRow: number,
  rows: number,
  data: Uint8Array
) {
  if (bytesPerRow < 1 || bytesPerRow > 0xffff || rows < 1 || rows > 0xffff) {
    throw new Error("Label band dimensions are outside the printer's supported range.");
  }
  if (data.length !== bytesPerRow * rows) {
    throw new Error("Label band data does not match its declared dimensions.");
  }

  const header = Uint8Array.from([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    rows & 0xff,
    (rows >> 8) & 0xff,
  ]);
  return concatBytes([header, data]);
}

/** One label: lead-in, the raster split into bands, then on to the next die cut. */
export function buildEscPosLabel(raster: LabelRaster, options: EscPosOptions = {}) {
  const { bytesPerRow, height, bytes } = raster;
  if (bytes.length !== bytesPerRow * height) {
    throw new Error("Label raster does not match its declared dimensions.");
  }

  const parts: Uint8Array[] = [new Uint8Array(LEAD_IN_BYTES)];
  for (let row = 0; row < height; row += BAND_ROWS) {
    const rows = Math.min(BAND_ROWS, height - row);
    parts.push(
      buildRasterBand(
        bytesPerRow,
        rows,
        bytes.subarray(row * bytesPerRow, (row + rows) * bytesPerRow)
      )
    );
  }
  const blind =
    options.endOfLabel === "feed" || options.feedDots !== undefined;
  parts.push(
    blind
      ? Uint8Array.from([0x1b, 0x4a, resolveFeed(options.feedDots)])
      : GAP_SEEK
  );
  return concatBytes(parts);
}

/**
 * `ESC J` maxes out at 255 dots, so a longer feed is several commands.
 */
function feedCommands(dots: number) {
  const parts: Uint8Array[] = [];
  let left = Math.max(0, Math.round(dots));
  while (left > 0) {
    const step = Math.min(255, left);
    parts.push(Uint8Array.from([0x1b, 0x4a, step]));
    left -= step;
  }
  return parts;
}

/**
 * Advance the finished label clear of the tear-off edge.
 *
 * The head sits several millimetres upstream of the tear bar, so when a label
 * finishes and the gap seek parks the paper for the next one, the label just
 * printed is still gripped inside the printer — visible, but impossible to
 * tear off without holding the feed button. The vendor's own driver ends a job
 * with a 10 mm `ESC J` for this reason.
 *
 * One further gap seek advances exactly one sticker pitch, which clears the
 * tear bar and, unlike a counted feed, leaves the paper registered so the next
 * job needs no correction. The cost is one blank sticker per job, which is why
 * this is per *job* and not per label: a run of twenty labels pays it once.
 */
function presentCommands(blind: boolean) {
  return blind ? feedCommands(PITCH_DOTS) : [GAP_SEEK];
}

/** A complete print job for a run of labels. */
export function buildEscPosJob(rasters: LabelRaster[], options: EscPosOptions = {}) {
  const copies = Math.max(1, Math.min(99, Math.trunc(options.copies ?? 1)));
  const parts: Uint8Array[] = [];
  for (const raster of rasters) {
    const label = buildEscPosLabel(raster, options);
    for (let i = 0; i < copies; i++) parts.push(label);
  }

  if (parts.length > 0 && (options.present ?? true)) {
    const blind = options.endOfLabel === "feed" || options.feedDots !== undefined;
    parts.push(...presentCommands(blind));
  }
  return concatBytes(parts);
}
