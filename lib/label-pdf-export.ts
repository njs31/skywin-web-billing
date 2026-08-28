import { jsPDF } from "jspdf";
import { BUSINESS } from "@/lib/business";
import { layoutCode128Bars } from "@/lib/code128";
import {
  LABEL_LAYOUT,
  THERMAL_LABEL_H_MM,
  THERMAL_LABEL_W_MM,
  THERMAL_LABEL_W_PX,
} from "@/lib/label-print-config";
import { toNumber } from "@/lib/utils";

export type LabelPdfProduct = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  saleRate: string;
  gstRate: string;
  expiryDate: string | null;
};

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

export function labelSku(product: LabelPdfProduct) {
  return (
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

export function labelScanCode(product: LabelPdfProduct) {
  return labelSku(product);
}

function drawLabel(doc: jsPDF, product: LabelPdfProduct) {
  const padX = 1.5;
  const innerW = THERMAL_LABEL_W_MM - padX * 2;
  const code = labelScanCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, THERMAL_LABEL_W_MM, THERMAL_LABEL_H_MM, "F");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(BUSINESS.name, THERMAL_LABEL_W_MM / 2, 2.8, {
    align: "center",
    maxWidth: innerW,
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.text(BUSINESS.tagline, THERMAL_LABEL_W_MM / 2, 5.0, {
    align: "center",
    maxWidth: innerW,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  const nameLines = doc
    .splitTextToSize(product.name.toUpperCase(), innerW)
    .slice(0, 2) as string[];
  nameLines.forEach((line, index) => {
    doc.text(line, THERMAL_LABEL_W_MM / 2, 7.2 + index * 2.3, {
      align: "center",
    });
  });

  const barcodeY = 10.4;
  const barcodeH = 9.4;
  const pxToMm = THERMAL_LABEL_W_MM / THERMAL_LABEL_W_PX;
  const { bars } = layoutCode128Bars(
    code,
    LABEL_LAYOUT.padX,
    THERMAL_LABEL_W_PX - LABEL_LAYOUT.padX * 2
  );
  for (const bar of bars) {
    doc.rect(bar.x * pxToMm, barcodeY, bar.width * pxToMm, barcodeH, "F");
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(code, THERMAL_LABEL_W_MM / 2, 20.6, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(exp ? `EXP ${exp}` : "EXP —", padX, 23.4);
  doc.setFont("helvetica", "bold");
  doc.text(`MRP ${rate.toFixed(2)}`, THERMAL_LABEL_W_MM - padX, 23.4, {
    align: "right",
  });
}

/** One 50×25 mm page per product — matches the thermal sticker. */
export async function buildAllLabelsPdf(products: LabelPdfProduct[]) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [THERMAL_LABEL_W_MM, THERMAL_LABEL_H_MM],
    compress: true,
  });

  products.forEach((product, index) => {
    if (index > 0) {
      doc.addPage([THERMAL_LABEL_W_MM, THERMAL_LABEL_H_MM], "landscape");
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
