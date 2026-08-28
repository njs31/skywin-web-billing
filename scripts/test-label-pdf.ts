/**
 * Smoke test: thermal label bitmap is 50×25 mm at 203 DPI.
 * Run: npx tsx scripts/test-label-pdf.ts
 */
import {
  THERMAL_LABEL_H_MM,
  THERMAL_LABEL_H_PX,
  THERMAL_LABEL_W_MM,
  THERMAL_LABEL_W_PX,
  THERMAL_PRINTER_DPI,
  mmToPx,
} from "../lib/label-print-config";

function main() {
  const wPx = mmToPx(THERMAL_LABEL_W_MM);
  const hPx = mmToPx(THERMAL_LABEL_H_MM);

  if (wPx !== THERMAL_LABEL_W_PX || hPx !== THERMAL_LABEL_H_PX) {
    throw new Error(
      `Pixel size mismatch: expected ${THERMAL_LABEL_W_PX}×${THERMAL_LABEL_H_PX}, got ${wPx}×${hPx}`
    );
  }

  const wMmBack = (wPx / THERMAL_PRINTER_DPI) * 25.4;
  const hMmBack = (hPx / THERMAL_PRINTER_DPI) * 25.4;

  if (
    Math.abs(wMmBack - THERMAL_LABEL_W_MM) > 0.2 ||
    Math.abs(hMmBack - THERMAL_LABEL_H_MM) > 0.2
  ) {
    throw new Error(
      `Round-trip mm mismatch: ${wMmBack.toFixed(2)}×${hMmBack.toFixed(2)}`
    );
  }

  console.log("PASS thermal label bitmap config");
  console.log(`  Sticker: ${THERMAL_LABEL_W_MM}×${THERMAL_LABEL_H_MM} mm`);
  console.log(`  Bitmap: ${THERMAL_LABEL_W_PX}×${THERMAL_LABEL_H_PX} px @ ${THERMAL_PRINTER_DPI} DPI`);
  console.log("  Output format: PNG raster (not PDF)");
}

main();
