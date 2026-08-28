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

async function renderLabelCanvas(product: LabelProduct) {
  const canvas = document.createElement("canvas");
  canvas.width = THERMAL_LABEL_W_PX;
  canvas.height = THERMAL_LABEL_H_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const code = productCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);
  const pad = 6;
  const innerW = canvas.width - pad * 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  drawCentered(ctx, BUSINESS.name, 5, "bold 10px Arial, Helvetica, sans-serif", innerW);
  drawCentered(
    ctx,
    `(${BUSINESS.tagline})`,
    17,
    "7px Arial, Helvetica, sans-serif",
    innerW
  );
  drawCentered(
    ctx,
    product.name.toUpperCase(),
    29,
    "bold 9px Arial, Helvetica, sans-serif",
    innerW
  );

  const qrSize = 70;
  const qrX = canvas.width - pad - qrSize;
  const qrY = canvas.height - pad - qrSize;
  const qrSrc = await qrDataUrl(code);
  const qrImg = await loadImage(qrSrc);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  const textRight = qrX - 6;
  let y = qrY + 1;

  ctx.textAlign = "left";
  ctx.font = "bold 11px Arial, Helvetica, sans-serif";
  let codeLine = code;
  while (codeLine.length > 1 && ctx.measureText(codeLine).width > textRight - pad) {
    codeLine = codeLine.slice(0, -1);
  }
  ctx.fillText(codeLine === code ? codeLine : `${codeLine}…`, pad, y);
  y += 16;

  ctx.font = "8px Arial, Helvetica, sans-serif";
  ctx.fillText(exp ? `EXP: ${exp}` : "EXP: —", pad, y);
  y += 14;

  ctx.fillText("RATE:", pad, y);
  ctx.font = "bold 10px Arial, Helvetica, sans-serif";
  const rateText = rate.toFixed(2);
  const rateW = ctx.measureText(rateText).width;
  ctx.fillText(rateText, textRight - rateW, y);

  return canvas;
}

/** Render one 35×22 mm label at the printer's native 203 DPI. */
export async function renderLabelPng(product: LabelProduct): Promise<string> {
  const canvas = await renderLabelCanvas(product);
  return canvas.toDataURL("image/png");
}

/** Convert a rendered label into the monochrome bytes required by ESC/POS raster mode. */
export async function renderLabelRaster(product: LabelProduct) {
  const canvas = await renderLabelCanvas(product);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      const luminance =
        pixels[pixel]! * 0.2126 +
        pixels[pixel + 1]! * 0.7152 +
        pixels[pixel + 2]! * 0.0722;
      if (luminance < 160) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        bytes[byteIndex]! |= 0x80 >> (x % 8);
      }
    }
  }

  return { width, height, bytesPerRow, bytes };
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
