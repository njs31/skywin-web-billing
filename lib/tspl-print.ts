/**
 * TSPL job builder for the POSiFLOW 2-inch label printer.
 *
 * Why TSPL and not ESC/POS: ESC/POS is a *receipt* language with no concept
 * of a label. On a die-cut roll the printer never learns where one sticker
 * ends, so artwork runs off the bottom onto the next label. TSPL's SIZE/GAP
 * pair tells the firmware the exact media geometry, so every label starts at
 * the top of a sticker and stops at the gap. Sending ESC/POS to a printer
 * sitting in label mode is also why the bytes came out as readable text
 * instead of a picture.
 */
import { LabelRaster } from "@/lib/label-render";
import {
  LABEL_GAP_MM,
  LABEL_H_MM,
  LABEL_W_MM,
  PRINT_X_DOTS,
} from "@/lib/label-print-config";

export type TsplOptions = {
  /** Gap between die-cut labels, in mm. */
  gapMm?: number;
  /** Burn temperature, 0 (lightest) to 15 (darkest). */
  density?: number;
  /** Inches per second. */
  speed?: number;
  /** false prints the label rotated 180°, for rolls loaded the other way. */
  upright?: boolean;
  /** Copies of each label. */
  copies?: number;
};

const CRLF = "\r\n";

function ascii(text: string) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
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
 * TSPL BITMAP data is the photographic negative of ESC/POS: a 0 bit burns a
 * dot, a 1 bit leaves the paper white. Sending our raster straight through
 * would print a solid black sticker.
 */
export function invertBits(bytes: Uint8Array) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = ~bytes[i]! & 0xff;
  return out;
}

/** The per-job media setup. Sent once, before any label. */
export function buildTsplHeader(options: TsplOptions = {}) {
  const {
    gapMm = LABEL_GAP_MM,
    density = 8,
    speed = 4,
    upright = true,
  } = options;

  // A space is required between the number and "mm" in TSPL's metric form.
  return ascii(
    [
      `SIZE ${LABEL_W_MM} mm,${LABEL_H_MM} mm`,
      `GAP ${gapMm} mm,0 mm`,
      `DIRECTION ${upright ? 1 : 0}`,
      "REFERENCE 0,0",
      `DENSITY ${density}`,
      `SPEED ${speed}`,
      "CLS",
      "",
    ].join(CRLF)
  );
}

/** One label: clear the buffer, place the raster, print it. */
export function buildTsplLabel(raster: LabelRaster, options: TsplOptions = {}) {
  const copies = Math.max(1, Math.min(999, Math.trunc(options.copies ?? 1)));
  if (raster.bytes.length !== raster.bytesPerRow * raster.height) {
    throw new Error("Label raster does not match its declared dimensions.");
  }

  return concatBytes([
    ascii(`CLS${CRLF}`),
    // width is in bytes, height in dots, mode 0 = overwrite.
    ascii(
      `BITMAP ${PRINT_X_DOTS},0,${raster.bytesPerRow},${raster.height},0,`
    ),
    invertBits(raster.bytes),
    ascii(CRLF),
    ascii(`PRINT 1,${copies}${CRLF}`),
  ]);
}

/** A complete print job for a run of labels. */
export function buildTsplJob(rasters: LabelRaster[], options: TsplOptions = {}) {
  return concatBytes([
    buildTsplHeader(options),
    ...rasters.map((raster) => buildTsplLabel(raster, options)),
  ]);
}

/**
 * Re-run the gap sensor calibration. Worth sending once when labels start
 * drifting, or after switching to a different roll.
 */
export function buildTsplCalibration(options: TsplOptions = {}) {
  return concatBytes([buildTsplHeader(options), ascii(`GAPDETECT${CRLF}`)]);
}
