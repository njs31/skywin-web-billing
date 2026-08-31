/**
 * QR layout for the product label, in printer dots.
 *
 * Why a QR at all: the Code 128 on a 50 × 25 mm sticker only gets 2–3 dots per
 * module, and a 203 DPI thermal head bleeds ink sideways. One dot of spread on
 * a 2-dot bar is a 50% width error, which is enough that a scanner cannot
 * recover the bar/space ratios. A QR carries its own error correction and
 * survives that bleed, so it reads where the linear symbol does not. Both are
 * printed: laser scanners can only see the linear one, phones and 2D imagers
 * prefer the QR.
 */
import QRCode from "qrcode";

export type QrBar = { x: number; y: number; width: number; height: number };

export type QrLayout = {
  /** Dots per QR module — always a whole number, for the same reason as Code 128. */
  moduleDots: number;
  /** Modules per side (21 for version 1, 25 for version 2, …). */
  modules: number;
  /** Rendered size of the symbol, excluding its quiet zone. */
  sizeDots: number;
  /** White margin the spec requires around the symbol. */
  quietDots: number;
  bars: QrBar[];
};

/** The spec's mandatory light margin. A QR without it will not be found. */
export const QR_QUIET_MODULES = 4;

/**
 * Below 2 dots a module is a single burnt dot, which bleeds into its
 * neighbours and takes the symbol with it.
 */
const MIN_MODULE_DOTS = 2;

/**
 * Lay a QR out on a whole number of dots inside `boxDots`.
 *
 * `boxDots` is the total space available including the quiet zone, so the
 * symbol itself is sized to leave that margin free.
 */
export function layoutQrDots(text: string, boxDots: number): QrLayout {
  const qr = QRCode.create(text || " ", { errorCorrectionLevel: "M" });
  const matrix = qr.modules as unknown as { size: number; data: Uint8Array };
  const modules = matrix.size;

  // Budget the quiet zone in modules so it scales with the symbol.
  const moduleDots = Math.max(
    MIN_MODULE_DOTS,
    Math.floor(boxDots / (modules + QR_QUIET_MODULES * 2))
  );
  const sizeDots = moduleDots * modules;
  const quietDots = moduleDots * QR_QUIET_MODULES;

  // Merge horizontal runs so a 25×25 symbol is a few dozen rects, not 625.
  const bars: QrBar[] = [];
  for (let row = 0; row < modules; row++) {
    let col = 0;
    while (col < modules) {
      if (!matrix.data[row * modules + col]) {
        col++;
        continue;
      }
      let run = 0;
      while (col + run < modules && matrix.data[row * modules + col + run]) run++;
      bars.push({
        x: col * moduleDots,
        y: row * moduleDots,
        width: run * moduleDots,
        height: moduleDots,
      });
      col += run;
    }
  }

  return { moduleDots, modules, sizeDots, quietDots, bars };
}
