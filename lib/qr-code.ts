/**
 * QR code for retail product labels.
 *
 * Replaces the Code 128 on the sticker (client request 2026-09-08): the label
 * now carries a QR of the product code on the right, no linear barcode. The QR
 * must be read with a phone camera or a 2D imager — a plain laser scanner
 * cannot read it.
 *
 * `qrcode` (already a dependency, used by the invoice) builds the module matrix
 * synchronously, the same way `code128.ts` builds its bar pattern.
 */
import QRCode from "qrcode";

export type QrBar = { x: number; y: number; width: number; height: number };

/**
 * Lay a QR code out on whole printer dots.
 *
 * Same reasoning as `layoutCode128Dots`: a thermal head burns whole dots only,
 * so the module has to be an integer number of dots or neighbouring modules
 * round to different widths and the grid stops scanning. Dark modules are
 * merged into horizontal runs so the plan carries a few dozen rectangles, not
 * hundreds. Coordinates are relative to the QR's top-left corner; the caller
 * offsets them onto the label.
 */
export function layoutQrDots(text: string, maxSizeDots: number) {
  const qr = QRCode.create(text || "0", { errorCorrectionLevel: "M" });
  const n: number = qr.modules.size;
  const data: Uint8Array = qr.modules.data;

  // floor so the finished QR never exceeds the box it was given; never let a
  // module fall below 3 dots (0.375 mm) or thermal bleed closes the grid.
  const moduleDots = Math.max(3, Math.floor(maxSizeDots / n));
  const totalDots = moduleDots * n;

  const bars: QrBar[] = [];
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!data[row * n + col]) {
        col += 1;
        continue;
      }
      let run = 0;
      while (col + run < n && data[row * n + (col + run)]) run += 1;
      bars.push({
        x: col * moduleDots,
        y: row * moduleDots,
        width: run * moduleDots,
        height: moduleDots,
      });
      col += run;
    }
  }

  return { bars, moduleDots, sizeModules: n, totalDots };
}
