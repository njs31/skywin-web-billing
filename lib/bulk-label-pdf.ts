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
 * Layout, 38 × 25 mm, inset a full 2.2 mm from every edge.
 *
 * A photo of a print-app's "printable area" tool showed the previous
 * version's QR and MRP touching the die-cut boundary — fine on screen, but
 * printers/cutters aren't pixel-perfect, so anything drawn to the raw edge
 * risks being clipped on the actual sticker. Every element now sits inside
 * a 2.2 mm margin on all four sides (content box: 33.6 × 20.6 mm) with
 * nothing — not even the QR's corner — touching the sticker's true edge.
 *
 *   SKYWIN BIOTECH        (bold, centred)
 *   (AGRI SUPER MARKET)   (centred, small)
 *   ───────────────────────────────
 *   <product name>            ┌──────────┐
 *   <code>                    │    QR    │  right column, 9.7mm square,
 *   EXP: <date>                │  9.7mm sq│  flush with the inset margin,
 *   MRP: <value>  (bold, big)  └──────────┘  not the sticker's raw edge
 */
function drawLabel(doc: jsPDF, product: BulkLabelProduct) {
  const W = BULK_LABEL_W_MM;
  const H = BULK_LABEL_H_MM;
  const margin = 2.2;
  const contentW = W - margin * 2;
  const centerX = W / 2;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // Masthead
  const companySize = fitSize(doc, BUSINESS.name, 7.5, contentW, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(companySize);
  doc.text(BUSINESS.name, centerX, 4.2, { align: "center" });

  const tagline = `(${BUSINESS.tagline})`;
  const taglineSize = fitSize(doc, tagline, 4.0, contentW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(taglineSize);
  doc.text(tagline, centerX, 6.6, { align: "center" });

  doc.setLineWidth(0.15);
  doc.line(margin, 7.4, W - margin, 7.4);

  // QR — right column. Pulled 1.5mm further left of the margin on request,
  // so it reads clearly clear of the corner rather than sitting flush with it.
  const qrSize = 9.7;
  const qrRightInset = 1.5;
  const qrX = W - margin - qrRightInset - qrSize;
  const qrY = 8.4;
  drawQr(doc, productCode(product), qrX, qrY, qrSize);

  // Left column: name, code, expiry, MRP.
  const leftX = margin;
  const leftW = qrX - margin - 1;

  const nameLines = wrapTwoLines(doc, product.name.toUpperCase(), 5.0, leftW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.0);
  doc.text(nameLines[0] ?? "", leftX, 10.6);
  if (nameLines[1]) doc.text(nameLines[1], leftX, 12.9);

  const codeText = productCode(product);
  const codeSize = fitSize(doc, codeText, 5.3, leftW, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(codeSize);
  doc.text(codeText, leftX, 15.5);

  const expText = `EXP:${product.expiryDate ? ` ${formatExp(product.expiryDate)}` : ""}`;
  const expSize = fitSize(doc, expText, 4.0, leftW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(expSize);
  doc.text(expText, leftX, 18.1);

  const mrpText = `MRP: ${inclusiveRate(product.saleRate, product.gstRate).toFixed(2)}`;
  const mrpSize = fitSize(doc, mrpText, 7.5, leftW, true, 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(mrpSize);
  doc.text(mrpText, leftX, 22.0);
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

// ---------------------------------------------------------------------------
// 50 × 30 mm variant — a bigger sticker some print shops stock instead of
// 38 × 25 mm. Same content and column layout, hand-tuned to its own margins
// rather than scaled, so the extra room goes to genuinely larger text and QR
// instead of proportionally-identical-but-blurry scaling.
// ---------------------------------------------------------------------------

export const BULK_LABEL_50_W_MM = 50;
export const BULK_LABEL_50_H_MM = 30;

/** Layout, 50 × 30 mm — same design as the 38×25mm version, more room. */
function drawLabel50x30(doc: jsPDF, product: BulkLabelProduct) {
  const W = BULK_LABEL_50_W_MM;
  const H = BULK_LABEL_50_H_MM;
  const margin = 2.5;
  const contentW = W - margin * 2;
  const centerX = W / 2;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // Masthead
  const companySize = fitSize(doc, BUSINESS.name, 10, contentW, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(companySize);
  doc.text(BUSINESS.name, centerX, 5.3, { align: "center" });

  const tagline = `(${BUSINESS.tagline})`;
  const taglineSize = fitSize(doc, tagline, 5.2, contentW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(taglineSize);
  doc.text(tagline, centerX, 8.2, { align: "center" });

  doc.setLineWidth(0.18);
  doc.line(margin, 9.2, W - margin, 9.2);

  // QR — right column, pulled 2mm further left of the margin so it clears
  // the corner (same reasoning as the 38×25mm version).
  const qrSize = 12;
  const qrRightInset = 2;
  const qrX = W - margin - qrRightInset - qrSize;
  const qrY = 9.8;
  drawQr(doc, productCode(product), qrX, qrY, qrSize);

  // Left column: name, code, expiry, MRP.
  const leftX = margin;
  const leftW = qrX - margin - 1;

  const nameLines = wrapTwoLines(doc, product.name.toUpperCase(), 6.2, leftW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.text(nameLines[0] ?? "", leftX, 13.0);
  if (nameLines[1]) doc.text(nameLines[1], leftX, 15.8);

  const codeText = productCode(product);
  const codeSize = fitSize(doc, codeText, 6.5, leftW, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(codeSize);
  doc.text(codeText, leftX, 18.8);

  const expText = `EXP:${product.expiryDate ? ` ${formatExp(product.expiryDate)}` : ""}`;
  const expSize = fitSize(doc, expText, 5.0, leftW, false);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(expSize);
  doc.text(expText, leftX, 21.8);

  const mrpText = `MRP: ${inclusiveRate(product.saleRate, product.gstRate).toFixed(2)}`;
  const mrpSize = fitSize(doc, mrpText, 9.5, leftW, true, 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(mrpSize);
  doc.text(mrpText, leftX, 26.3);
}

/** One 50 × 30 mm page per product. */
export function buildBulkLabelsPdf50x30(products: BulkLabelProduct[]) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [BULK_LABEL_50_W_MM, BULK_LABEL_50_H_MM],
    compress: true,
  });

  products.forEach((product, index) => {
    if (index > 0) {
      doc.addPage([BULK_LABEL_50_W_MM, BULK_LABEL_50_H_MM], "landscape");
    }
    drawLabel50x30(doc, product);
  });

  if (products.length === 0) {
    drawLabel50x30(doc, {
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
