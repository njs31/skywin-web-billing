/**
 * Smoke test: thermal label PDF is exactly 50×25 mm per page.
 * Barcode rendering is browser-only (JsBarcode + DOM canvas); this verifies PDF geometry.
 * Run: npx tsx scripts/test-label-pdf.ts
 */
import { jsPDF } from "jspdf";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  THERMAL_LABEL_H_MM,
  THERMAL_LABEL_W_MM,
} from "../lib/label-print-config";

function buildTestPdf() {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [THERMAL_LABEL_W_MM, THERMAL_LABEL_H_MM],
    compress: true,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text("SKYWIN LABEL SIZE TEST", 2, 12);
  doc.setFontSize(5);
  doc.text(`${THERMAL_LABEL_W_MM} x ${THERMAL_LABEL_H_MM} mm`, 2, 18);

  return doc;
}

function assertPageSize(doc: jsPDF, page: number) {
  doc.setPage(page);
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const ok =
    Math.abs(w - THERMAL_LABEL_W_MM) < 0.01 &&
    Math.abs(h - THERMAL_LABEL_H_MM) < 0.01;
  if (!ok) {
    throw new Error(
      `Page ${page}: expected ${THERMAL_LABEL_W_MM}×${THERMAL_LABEL_H_MM} mm, got ${w}×${h} mm`
    );
  }
}

function parseMediaBoxMm(buf: Buffer) {
  const raw = buf.toString("latin1");
  const mediaBox = raw.match(
    /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/
  );
  if (!mediaBox) throw new Error("MediaBox not found in PDF");

  const widthPt = Number(mediaBox[3]) - Number(mediaBox[1]);
  const heightPt = Number(mediaBox[4]) - Number(mediaBox[2]);
  return {
    widthMm: widthPt / 2.83465,
    heightMm: heightPt / 2.83465,
  };
}

function main() {
  const doc = buildTestPdf();
  assertPageSize(doc, 1);

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "label-smoke-test.pdf");
  const buf = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(outPath, buf);

  const { widthMm, heightMm } = parseMediaBoxMm(buf);
  const mediaOk =
    Math.abs(widthMm - THERMAL_LABEL_W_MM) < 0.5 &&
    Math.abs(heightMm - THERMAL_LABEL_H_MM) < 0.5;
  if (!mediaOk) {
    throw new Error(
      `PDF MediaBox ${widthMm.toFixed(2)}×${heightMm.toFixed(2)} mm — expected ${THERMAL_LABEL_W_MM}×${THERMAL_LABEL_H_MM} mm`
    );
  }

  console.log("PASS label PDF smoke test");
  console.log(`  Page size (jsPDF): ${THERMAL_LABEL_W_MM}×${THERMAL_LABEL_H_MM} mm`);
  console.log(
    `  MediaBox (parsed): ${widthMm.toFixed(2)}×${heightMm.toFixed(2)} mm`
  );
  console.log(`  Sample PDF: ${outPath}`);
}

main();
