/**
 * POSiFLOW TagPro (PSF20) — 2-inch / 58 mm thermal label printer, 203 DPI.
 * Sticker roll: 50 × 25 mm direct thermal labels (2" × 1").
 *
 * Important: send raster PNG images to this printer — not PDF/PostScript.
 */
export const THERMAL_LABEL_W_MM = 50;
export const THERMAL_LABEL_H_MM = 25;
export const THERMAL_PRINTER_MAX_WIDTH_MM = 58;
export const THERMAL_PRINTER_DPI = 203;

export function mmToPx(mm: number, dpi = THERMAL_PRINTER_DPI) {
  return Math.round((mm / 25.4) * dpi);
}

export const THERMAL_LABEL_W_PX = mmToPx(THERMAL_LABEL_W_MM);
export const THERMAL_LABEL_H_PX = mmToPx(THERMAL_LABEL_H_MM);
