import QRCode from "qrcode";
import { BUSINESS } from "@/lib/business";
import {
  THERMAL_LABEL_H_PX,
  THERMAL_LABEL_W_PX,
} from "@/lib/label-print-config";
import { toNumber } from "@/lib/utils";

export type LabelProduct = {
  id: number;
  name: string;
  barcode: string | null;
  sku: string | null;
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

export function productCode(product: LabelProduct) {
  return (
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

export function getLabelFields(product: LabelProduct) {
  return {
    code: productCode(product),
    rate: inclusiveRate(product.saleRate, product.gstRate),
    exp: formatExp(product.expiryDate),
    name: product.name.toUpperCase(),
  };
}

export function expandProducts(products: LabelProduct[], copies = 1) {
  const qty = Math.max(1, Math.min(99, copies));
  const out: LabelProduct[] = [];
  for (const product of products) {
    for (let i = 0; i < qty; i++) out.push(product);
  }
  return out;
}

async function qrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(code, {
    margin: 0,
    width: 256,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  font: string,
  maxWidth: number
) {
  ctx.font = font;
  let line = text;
  while (line.length > 1 && ctx.measureText(line).width > maxWidth) {
    line = line.slice(0, -1);
  }
  if (line !== text) line = `${line}…`;
  const x = (ctx.canvas.width - ctx.measureText(line).width) / 2;
  ctx.fillText(line, x, y);
}

/**
 * 50×25 mm label — matches Skywin reference layout:
 * centered header, product name, code/EXP/RATE on left, QR on right.
 */
export async function renderLabelPng(product: LabelProduct): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = THERMAL_LABEL_W_PX;
  canvas.height = THERMAL_LABEL_H_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const code = productCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);
  const pad = 8;
  const innerW = canvas.width - pad * 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  drawCentered(ctx, BUSINESS.name, 6, "bold 13px Arial, Helvetica, sans-serif", innerW);
  drawCentered(
    ctx,
    `(${BUSINESS.tagline})`,
    20,
    "9px Arial, Helvetica, sans-serif",
    innerW
  );
  drawCentered(
    ctx,
    product.name.toUpperCase(),
    32,
    "bold 10px Arial, Helvetica, sans-serif",
    innerW
  );

  const qrSize = 82;
  const qrX = canvas.width - pad - qrSize;
  const qrY = canvas.height - pad - qrSize;
  const qrSrc = await qrDataUrl(code);
  const qrImg = await loadImage(qrSrc);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  const textRight = qrX - 6;
  let y = qrY + 2;

  ctx.textAlign = "left";
  ctx.font = "bold 15px Arial, Helvetica, sans-serif";
  ctx.fillText(code, pad, y);
  y += 20;

  ctx.font = "10px Arial, Helvetica, sans-serif";
  ctx.fillText(`EXP: ${exp}`, pad, y);
  y += 16;

  ctx.fillText("RATE:", pad, y);
  ctx.font = "bold 11px Arial, Helvetica, sans-serif";
  const rateText = rate.toFixed(2);
  const rateW = ctx.measureText(rateText).width;
  ctx.fillText(rateText, textRight - rateW, y);

  return canvas.toDataURL("image/png");
}

export async function renderLabelPngMap(products: LabelProduct[]) {
  const map: Record<number, string> = {};
  for (const product of products) {
    map[product.id] = await renderLabelPng(product);
  }
  return map;
}

export function expandLabelUrls(
  products: LabelProduct[],
  pngMap: Record<number, string>,
  copies = 1
) {
  const qty = Math.max(1, Math.min(99, copies));
  const urls: string[] = [];
  for (const product of products) {
    const png = pngMap[product.id];
    if (!png) continue;
    for (let i = 0; i < qty; i++) urls.push(png);
  }
  return urls;
}

function triggerDownload(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

/** Download label PNG file(s). Safe for TagPro — never sends PostScript. */
export function downloadLabelPngFiles(
  products: LabelProduct[],
  pngMap: Record<number, string>,
  copies = 1
) {
  const qty = Math.max(1, Math.min(99, copies));
  for (const product of products) {
    const png = pngMap[product.id];
    if (!png) continue;
    const base = `label-${productCode(product)}`;
    for (let i = 0; i < qty; i++) {
      const name = qty > 1 ? `${base}-${i + 1}.png` : `${base}.png`;
      triggerDownload(png, name);
    }
  }
}

export async function downloadLabelPng(product: LabelProduct) {
  const dataUrl = await renderLabelPng(product);
  triggerDownload(dataUrl, `label-${productCode(product)}.png`);
}
