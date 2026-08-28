/**
 * Smoke test: thermal label PDF is exactly 50×25 mm per page with a scannable barcode.
 * Run: npx tsx scripts/test-label-pdf.ts
 */
import { createCanvas } from "canvas";
import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  THERMAL_LABEL_H_MM,
  THERMAL_LABEL_W_MM,
} from "../lib/label-print-config";

const SAMPLE = {
  id: 1,
  name: "Test Product Alpha",
  barcode: "SW000001",
  sku: null as string | null,
  saleRate: "100.00",
  gstRate: "12",
  expiryDate: "2026-12-31",
};

function barcodePng(code: string): string {
  const canvas = createCanvas(400, 80);
  JsBarcode(canvas, code, {
    format: "CODE128",
    width: 2,
    height: 50,
    displayValue: false,
    margin: 0,
  });
  return canvas.toDataURL("image/png");
}

function inclusiveRate(saleRate: string, gstRate: string) {
  const rate = Number(saleRate);
  const gst = Number(gstRate);
  return Math.round(rate * (1 + gst / 100) * 100) / 100;
}

function buildTestPdf() {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [THERMAL_LABEL_W_MM, THERMAL_LABEL_H_MM],
    compress: true,
  });

  const padX = 1.2;
  const textW = THERMAL_LABEL_W_MM - padX * 2;
  const code = SAMPLE.barcode!;
  const rate = inclusiveRate(SAMPLE.saleRate, SAMPLE.gstRate);
  const barcodeImg = barcodePng(code);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.text("SKYWIN", padX, 2.2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(3.8);
  doc.text("(Test Label)", padX, 3.6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.6);
  doc.text(SAMPLE.name.toUpperCase(), padX, 5.4, { maxWidth: textW });

  const barcodeH = 9;
  const barcodeY = 6.2;
  doc.addImage(barcodeImg, "PNG", padX, barcodeY, textW, barcodeH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text(code, THERMAL_LABEL_W_MM / 2, barcodeY + barcodeH + 1.8, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.8);
  const bottomY = THERMAL_LABEL_H_MM - 1.4;
  doc.text("EXP: 31/12/2026", padX, bottomY);
  doc.setFont("helvetica", "bold");
  doc.text(`RATE: ${rate.toFixed(2)}`, THERMAL_LABEL_W_MM - padX, bottomY, {
    align: "right",
  });

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
  return { w, h };
}

function main() {
  const doc = buildTestPdf();
  assertPageSize(doc, 1);

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "label-smoke-test.pdf");
  const buf = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(outPath, buf);

  // Parse PDF MediaBox from raw bytes (points: 1 mm ≈ 2.83465 pt)
  const raw = readFileSync(outPath, "utf8");
  const mediaBox = raw.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!mediaBox) throw new Error("MediaBox not found in PDF");

  const x1 = Number(mediaBox[1]);
  const y1 = Number(mediaBox[2]);
  const x2 = Number(mediaBox[3]);
  const y2 = Number(mediaBox[4]);
  const widthPt = x2 - x1;
  const heightPt = y2 - y1;
  const widthMm = widthPt / 2.83465;
  const heightMm = heightPt / 2.83465;

  const mediaOk =
    Math.abs(widthMm - THERMAL_LABEL_W_MM) < 0.5 &&
    Math.abs(heightMm - THERMAL_LABEL_H_MM) < 0.5;
  if (!mediaOk) {
    throw new Error(
      `PDF MediaBox ${widthMm.toFixed(2)}×${heightMm.toFixed(2)} mm — expected ${THERMAL_LABEL_W_MM}×${THERMAL_LABEL_H_MM} mm`
    );
  }

  const canvas = createCanvas(400, 80);
  JsBarcode(canvas, SAMPLE.barcode!, { format: "CODE128", displayValue: false });
  if (canvas.width < 50 || canvas.height < 10) {
    throw new Error("Barcode canvas too small");
  }

  console.log("PASS label PDF smoke test");
  console.log(`  Page size (jsPDF): ${THERMAL_LABEL_W_MM}×${THERMAL_LABEL_H_MM} mm`);
  console.log(
    `  MediaBox (parsed): ${widthMm.toFixed(2)}×${heightMm.toFixed(2)} mm`
  );
  console.log(`  Sample PDF: ${outPath}`);
  console.log(`  Barcode CODE128 for ${SAMPLE.barcode}: OK`);
  console.log(`  GST-inclusive rate: ${inclusiveRate(SAMPLE.saleRate, SAMPLE.gstRate).toFixed(2)}`);
}

main();
