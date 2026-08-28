import JsBarcode from "jsbarcode";
import { BUSINESS } from "@/lib/business";
import {
  THERMAL_LABEL_H_PX,
  THERMAL_LABEL_H_MM,
  THERMAL_LABEL_W_PX,
  THERMAL_LABEL_W_MM,
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

export function barcodeDataUrl(code: string): string {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, code, {
    format: "CODE128",
    width: 2,
    height: 56,
    displayValue: false,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

/** Draw one 50×25 mm label as a PNG bitmap (203 DPI). */
export async function renderLabelPng(
  product: LabelProduct,
  barcodeImgSrc: string
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = THERMAL_LABEL_W_PX;
  canvas.height = THERMAL_LABEL_H_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const pad = 10;
  const innerW = canvas.width - pad * 2;
  const code = productCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  let y = 6;

  ctx.font = "bold 11px Arial, Helvetica, sans-serif";
  ctx.fillText(truncate(ctx, BUSINESS.name, innerW), pad, y);
  y += 13;

  ctx.font = "8px Arial, Helvetica, sans-serif";
  ctx.fillText(truncate(ctx, `(${BUSINESS.tagline})`, innerW), pad, y);
  y += 11;

  ctx.font = "bold 10px Arial, Helvetica, sans-serif";
  ctx.fillText(truncate(ctx, product.name.toUpperCase(), innerW), pad, y);
  y += 13;

  const barcodeH = 72;
  if (barcodeImgSrc) {
    const barcodeImg = await loadImage(barcodeImgSrc);
    ctx.drawImage(barcodeImg, pad, y, innerW, barcodeH);
  }
  y += barcodeH + 4;

  ctx.font = "bold 12px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(code, canvas.width / 2, y);
  ctx.textAlign = "left";
  y += 14;

  ctx.font = "9px Arial, Helvetica, sans-serif";
  const footerY = canvas.height - pad - 10;
  ctx.fillText(`EXP: ${exp || "—"}`, pad, footerY);
  ctx.font = "bold 10px Arial, Helvetica, sans-serif";
  const rateText = `RATE: ${rate.toFixed(2)}`;
  const rateW = ctx.measureText(rateText).width;
  ctx.fillText(rateText, canvas.width - pad - rateW, footerY);

  return canvas.toDataURL("image/png");
}

export async function renderLabelPngs(
  products: LabelProduct[],
  copies = 1
): Promise<string[]> {
  const qty = Math.max(1, Math.min(99, copies));
  const urls: string[] = [];
  for (const product of products) {
    const barcodeSrc = barcodeDataUrl(productCode(product));
    for (let i = 0; i < qty; i++) {
      urls.push(await renderLabelPng(product, barcodeSrc));
    }
  }
  return urls;
}

function printHtmlForImages(imageUrls: string[]) {
  const pages = imageUrls
    .map(
      (src) =>
        `<img class="label-page" src="${src}" alt="Label" width="${THERMAL_LABEL_W_PX}" height="${THERMAL_LABEL_H_PX}" />`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Skywin Label</title>
<style>
@page {
  size: ${THERMAL_LABEL_W_MM}mm ${THERMAL_LABEL_H_MM}mm;
  margin: 0;
}
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
}
.label-page {
  display: block;
  width: ${THERMAL_LABEL_W_MM}mm;
  height: ${THERMAL_LABEL_H_MM}mm;
  page-break-after: always;
  break-after: page;
  object-fit: fill;
}
.label-page:last-child {
  page-break-after: auto;
  break-after: auto;
}
</style>
</head>
<body>${pages}</body>
</html>`;
}

function waitForImages(doc: Document) {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
}

/** Print raster labels — safe for thermal printers (not PDF). */
export async function printLabelImages(
  products: LabelProduct[],
  copies = 1
) {
  if (products.length === 0 || typeof window === "undefined") return;

  const imageUrls = await renderLabelPngs(products, copies);

  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
  );
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("Print frame unavailable");
  }

  doc.open();
  doc.write(printHtmlForImages(imageUrls));
  doc.close();

  await waitForImages(doc);
  await new Promise((resolve) => setTimeout(resolve, 100));

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      iframe.remove();
      resolve();
    };
    win.addEventListener("afterprint", cleanup, { once: true });
    win.focus();
    win.print();
    setTimeout(cleanup, 60_000);
  });
}

/** Download a single label PNG (e.g. for POSiFLOW mobile app). */
export async function downloadLabelPng(product: LabelProduct) {
  const barcodeSrc = barcodeDataUrl(productCode(product));
  const dataUrl = await renderLabelPng(product, barcodeSrc);
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `label-${productCode(product)}.png`;
  link.click();
}
