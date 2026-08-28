import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { BUSINESS } from "@/lib/business";
import { toNumber } from "@/lib/utils";

/** Sticker sheet: 105 × 297 mm with 2 × 10 labels of 38 × 25 mm. */
export const LABEL_COLS = 2;
export const LABEL_ROWS = 10;
export const LABELS_PER_SHEET = LABEL_COLS * LABEL_ROWS;
export const SHEET_W_MM = 105;
export const SHEET_H_MM = 297;
export const LABEL_W_MM = 38;
export const LABEL_H_MM = 25;
const PAD_TOP = 5.5;
const COL_OFFSET = (SHEET_W_MM - LABEL_COLS * LABEL_W_MM) / (LABEL_COLS + 1);
const ROW_GAP = (SHEET_H_MM - PAD_TOP - LABEL_ROWS * LABEL_H_MM) / LABEL_ROWS;
const QR_MM = 8;
const CONTENT_H = 17;

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
    product.sku?.trim() ||
    product.barcode?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

export function labelScanCode(product: LabelPdfProduct) {
  return product.barcode?.trim() || product.sku?.trim() || labelSku(product);
}

async function qrDataUrl(code: string) {
  return QRCode.toDataURL(code, {
    margin: 0,
    width: 256,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

function drawLabel(
  doc: jsPDF,
  product: LabelPdfProduct,
  qrImg: string,
  x: number,
  y: number
) {
  const padX = 1.0;
  const padY = 1.0;
  const textW = LABEL_W_MM - padX * 2 - QR_MM - 1.0;
  const topPad = padY;
  const sku = labelSku(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate);

  const nameLine =
    (doc
      .setFont("helvetica", "bold")
      .setFontSize(5.2)
      .splitTextToSize(product.name.toUpperCase(), textW)
      .slice(0, 1)[0] as string) || "";

  type Line = {
    text: string;
    dy: number;
    size: number;
    bold?: boolean;
    full?: boolean;
  };

  const lines: Line[] = [
    { text: BUSINESS.name, dy: 2.0, size: 6.0, bold: true, full: true },
    { text: `(${BUSINESS.tagline})`, dy: 4.4, size: 4.4, full: true },
    { text: nameLine, dy: 7.6, size: 5.2, bold: true },
    { text: `SKU: ${sku}`, dy: 10.6, size: 6.2, bold: true },
    { text: `EXP: ${formatExp(product.expiryDate)}`, dy: 13.2, size: 5.2 },
    { text: `MRP: ${rate.toFixed(2)}`, dy: 16.0, size: 6.4, bold: true },
  ];

  doc.setTextColor(0, 0, 0);

  for (const line of lines) {
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    doc.setFontSize(line.size);
    const maxW = line.full ? LABEL_W_MM - padX * 2 : textW;
    if (line.full) {
      /* Center full-width lines */
      const textWidth = doc.getTextWidth(line.text);
      const centerX = x + (LABEL_W_MM - textWidth) / 2;
      doc.text(line.text, centerX, y + topPad + line.dy, { maxWidth: maxW });
    } else {
      doc.text(line.text, x + padX, y + topPad + line.dy, { maxWidth: maxW });
    }
  }

  /* Separator line below tagline */
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);
  doc.line(x + padX, y + topPad + 5.6, x + LABEL_W_MM - padX, y + topPad + 5.6);

  if (qrImg) {
    doc.addImage(
      qrImg,
      "PNG",
      x + LABEL_W_MM - padX - QR_MM,
      y + topPad + 7.0,
      QR_MM,
      QR_MM
    );
  }
}

/** Build a multi-page PDF — one 105×297 mm sheet per 30 labels (35×22 mm each). */
export async function buildAllLabelsPdf(products: LabelPdfProduct[]) {
  const qrMap = new Map<number, string>();
  for (const product of products) {
    qrMap.set(product.id, await qrDataUrl(labelScanCode(product)));
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [SHEET_W_MM, SHEET_H_MM],
    compress: true,
  });

  const totalSlots = Math.max(products.length, 1);
  let slot = 0;

  while (slot < totalSlots) {
    if (slot > 0) {
      doc.addPage([SHEET_W_MM, SHEET_H_MM], "portrait");
    }

    for (let i = 0; i < LABELS_PER_SHEET && slot < products.length; i++, slot++) {
      const product = products[slot]!;
      const col = i % LABEL_COLS;
      const row = Math.floor(i / LABEL_COLS);
      const x = col * LABEL_W_MM;
      const y = PAD_TOP + row * (LABEL_H_MM + ROW_GAP);
      drawLabel(doc, product, qrMap.get(product.id) || "", x, y);
    }
  }

  return Buffer.from(doc.output("arraybuffer"));
}
