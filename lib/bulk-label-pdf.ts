/**
 * Bulk label PDF for an outside print shop — a different physical sticker
 * (38 × 25 mm) than the POSiFLOW thermal roll, and printed on ordinary
 * equipment rather than a thermal head. So this lays out directly in mm
 * with the `qrcode` module matrix, independent of `label-print-config.ts` /
 * `label-layout.ts`, which are tuned for the thermal printer's 8-dots/mm
 * grid and must stay untouched for that path.
 *
 * One page per product, sized to the sticker itself, in stock order.
 */
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { BUSINESS } from "@/lib/business";
import { toNumber } from "@/lib/utils";

export type BulkLabelProduct = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  saleRate: string;
  gstRate: string;
  expiryDate: string | null;
};

export const BULK_LABEL_W_MM = 38;
export const BULK_LABEL_H_MM = 25;

function inclusiveRate(saleRate: string | number, gstRate: string | number) {
  const rate = toNumber(saleRate);
  const gst = toNumber(gstRate);
  return Math.round(rate * (1 + gst / 100) * 100) / 100;
}

function formatExp(value: string | null) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function productCode(product: BulkLabelProduct) {
  return (
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

function measureWidthMm(doc: jsPDF, text: string, size: number, bold: boolean) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  return doc.getTextWidth(text);
}

/** Shrink font size (0.25pt steps) until `text` fits `maxWidthMm`. */
function fitSize(
  doc: jsPDF,
  text: string,
  startSize: number,
  maxWidthMm: number,
  bold: boolean,
  minSize = 4
) {
  let size = startSize;
  while (size > minSize && measureWidthMm(doc, text, size, bold) > maxWidthMm) {
    size -= 0.25;
  }
  return size;
}

/** Wrap to at most two lines at a fixed size, ellipsizing an overflowing 2nd line. */
function wrapTwoLines(
  doc: jsPDF,
  text: string,
  size: number,
  maxWidthMm: number,
  bold: boolean
): string[] {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, maxWidthMm) as string[];
  if (lines.length <= 2) return lines;
  let second = lines[1]!;
  while (
    second.length > 1 &&
    measureWidthMm(doc, `${second}…`, size, bold) > maxWidthMm
  ) {
    second = second.slice(0, -1);
  }
  return [lines[0]!, `${second}…`];
}

function drawQr(doc: jsPDF, code: string, x: number, y: number, sizeMm: number) {
  const qr = QRCode.create(code || "0", { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const moduleMm = sizeMm / n;
  doc.setFillColor(0, 0, 0);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (data[row * n + col]) {
        doc.rect(x + col * moduleMm, y + row * moduleMm, moduleMm, moduleMm, "F");
      }
    }
  }
}

/**
 * Layout, 38 × 25 mm:
 *
 *   SKYWIN BIOTECH        (bold, centred)
 *   (AGRI SUPER MARKET)   (centred, small)
 *   ───────────────────────────────
 *   <product name>            ┌──────────┐
 *   <code>                    │    QR    │  right column, sized to fill
 *   EXP: <date>                │  15mm sq │  the body height — the QR is
 *   MRP: <value>  (bold, big)  └──────────┘  the thing a phone has to read
 */
function drawLabel(doc: jsPDF, product: BulkLabelProduct) {
  const W = BULK_LABEL_W_MM;
  const H = BULK_LABEL_H_MM;
  const margin = 1;
  const contentW = W - margin * 2;
  const centerX = W / 2;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // Masthead
  const companySize = fitSize(doc, BUSINESS.name, 8, contentW, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(companySize);
  doc.text(BUSINESS.name, centerX, 4.6, { align: "center" });

  const tagline = `(${BUSINESS.tagline})`;
  const taglineSize = fitSize(doc, tagline, 4.3, contentW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(taglineSize);
  doc.text(tagline, centerX, 7.2, { align: "center" });

  doc.setLineWidth(0.15);
  doc.line(margin, 8.0, W - margin, 8.0);

  // QR — right column, as large as the body allows.
  const qrSize = 14.5;
  const qrX = W - margin - qrSize;
  const qrY = 8.6;
  drawQr(doc, productCode(product), qrX, qrY, qrSize);

  // Left column: name, code, expiry, MRP.
  const leftX = margin;
  const leftW = qrX - margin - 1;

  const nameLines = wrapTwoLines(doc, product.name.toUpperCase(), 5.2, leftW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.2);
  doc.text(nameLines[0] ?? "", leftX, 11.0);
  if (nameLines[1]) doc.text(nameLines[1], leftX, 13.2);

  const codeText = productCode(product);
  const codeSize = fitSize(doc, codeText, 5.5, leftW, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(codeSize);
  doc.text(codeText, leftX, 15.8);

  const expText = `EXP:${product.expiryDate ? ` ${formatExp(product.expiryDate)}` : ""}`;
  const expSize = fitSize(doc, expText, 4.3, leftW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(expSize);
  doc.text(expText, leftX, 18.2);

  const mrpText = `MRP: ${inclusiveRate(product.saleRate, product.gstRate).toFixed(2)}`;
  const mrpSize = fitSize(doc, mrpText, 8, leftW, true, 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(mrpSize);
  doc.text(mrpText, leftX, 23.0);
}

/** One 38 × 25 mm page per product. */
export function buildBulkLabelsPdf(products: BulkLabelProduct[]) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [BULK_LABEL_W_MM, BULK_LABEL_H_MM],
    compress: true,
  });

  products.forEach((product, index) => {
    if (index > 0) {
      doc.addPage([BULK_LABEL_W_MM, BULK_LABEL_H_MM], "landscape");
    }
    drawLabel(doc, product);
  });

  if (products.length === 0) {
    drawLabel(doc, {
      id: 0,
      name: "SAMPLE",
      sku: "SW000000",
      barcode: "SW000000",
      saleRate: "0",
      gstRate: "0",
      expiryDate: null,
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
