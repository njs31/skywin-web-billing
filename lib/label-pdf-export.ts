import { jsPDF } from "jspdf";
import { buildLabelPlan } from "@/lib/label-layout";
import {
  DOTS_PER_MM,
  LABEL_H_MM,
  LABEL_W_MM,
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

/**
 * Draw the same plan the thermal printer gets, scaled from dots to mm.
 * jsPDF positions text by baseline and uses Helvetica metrics, which is
 * exactly what `label-layout` measures with, so the lines break identically.
 */
function drawLabel(doc: jsPDF, product: LabelPdfProduct) {
  const plan = buildLabelPlan({
    code: labelScanCode(product),
    name: product.name.toUpperCase(),
    mrp: inclusiveRate(product.saleRate, product.gstRate).toFixed(2),
    exp: formatExp(product.expiryDate),
  });
  const mm = (dots: number) => dots / DOTS_PER_MM;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, LABEL_W_MM, LABEL_H_MM, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);

  for (const bar of plan.bars) {
    doc.rect(mm(bar.x), mm(bar.y), mm(bar.width), mm(bar.height), "F");
  }

  for (const item of plan.texts) {
    doc.setFont("helvetica", item.bold ? "bold" : "normal");
    // jsPDF sizes text in points; the plan is in dots at 8 dots/mm.
    doc.setFontSize(mm(item.size) * 72 / 25.4);
    doc.text(item.text, mm(item.x), mm(item.baseline), {
      align:
        item.anchor === "middle" ? "center" : item.anchor === "end" ? "right" : "left",
      baseline: "alphabetic",
    });
  }
}

/** One 50×25 mm page per product — matches the thermal sticker. */
export async function buildAllLabelsPdf(products: LabelPdfProduct[]) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [LABEL_W_MM, LABEL_H_MM],
    compress: true,
  });

  products.forEach((product, index) => {
    if (index > 0) {
      doc.addPage([LABEL_W_MM, LABEL_H_MM], "landscape");
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
