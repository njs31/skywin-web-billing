/**
 * POSiFLOW PSF20 / TagPro — 2-inch / 58 mm thermal printer, 203 DPI.
 * Sticker roll: 50 × 25 mm (5.0 × 2.5 cm) direct thermal labels.
 *
 * Send a 203 DPI raster PNG / ESC/POS bitmap — never PDF/PostScript.
 */
export const THERMAL_LABEL_W_MM = 50;
export const THERMAL_LABEL_H_MM = 25;
export const THERMAL_PRINTER_MAX_WIDTH_MM = 58;
export const THERMAL_PRINTER_DPI = 203;
export const THERMAL_LABEL_SIZE_LABEL = "50 × 25 mm";

export function mmToPx(mm: number, dpi = THERMAL_PRINTER_DPI) {
  return Math.round((mm / 25.4) * dpi);
}

export const THERMAL_LABEL_W_PX = mmToPx(THERMAL_LABEL_W_MM);
export const THERMAL_LABEL_H_PX = mmToPx(THERMAL_LABEL_H_MM);

/** Pixel layout for a 50×25 mm sticker at native printer DPI. */
export const LABEL_LAYOUT = {
  padX: 12,
  padY: 6,
  companyY: 6,
  companySize: 15,
  taglineY: 22,
  taglineSize: 10,
  nameY: 35,
  nameSize: 13,
  nameLineHeight: 14,
  nameLines: 2,
  barcodeY: 64,
  barcodeH: 92,
  codeY: 158,
  codeSize: 12,
  footerY: 180,
  footerSize: 12,
} as const;
