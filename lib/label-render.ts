import { BUSINESS } from "@/lib/business";
import { layoutCode128Bars } from "@/lib/code128";
import {
  LABEL_LAYOUT,
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

function fitLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  let line = text;
  while (line.length > 1 && ctx.measureText(line).width > maxWidth) {
    line = line.slice(0, -1);
  }
  return line === text ? line : `${line}…`;
}

function drawCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  font: string,
  maxWidth: number
) {
  ctx.font = font;
  const line = fitLine(ctx, text, maxWidth);
  const x = (ctx.canvas.width - ctx.measureText(line).width) / 2;
  ctx.fillText(line, x, y);
}

function wrapName(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fitLine(ctx, kept[maxLines - 1]!, maxWidth);
  return kept;
}

function renderLabelCanvas(product: LabelProduct) {
  const canvas = document.createElement("canvas");
  canvas.width = THERMAL_LABEL_W_PX;
  canvas.height = THERMAL_LABEL_H_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const { code, rate, exp, name } = getLabelFields(product);
  const {
    padX,
    companyY,
    companySize,
    taglineY,
    taglineSize,
    nameY,
    nameSize,
    nameLineHeight,
    barcodeY,
    barcodeH,
    codeY,
    codeSize,
    footerY,
    footerSize,
  } = LABEL_LAYOUT;
  const innerW = canvas.width - padX * 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  drawCentered(
    ctx,
    BUSINESS.name,
    companyY,
    `bold ${companySize}px Arial, Helvetica, sans-serif`,
    innerW
  );
  drawCentered(
    ctx,
    BUSINESS.tagline,
    taglineY,
    `${taglineSize}px Arial, Helvetica, sans-serif`,
    innerW
  );

  ctx.font = `bold ${nameSize}px Arial, Helvetica, sans-serif`;
  const nameLines = wrapName(ctx, name, innerW, LABEL_LAYOUT.nameLines);
  nameLines.forEach((line, index) => {
    const width = ctx.measureText(line).width;
    ctx.fillText(line, (canvas.width - width) / 2, nameY + index * nameLineHeight);
  });

  const { bars } = layoutCode128Bars(code, padX, innerW);
  for (const bar of bars) {
    ctx.fillRect(bar.x, barcodeY, bar.width, barcodeH);
  }

  drawCentered(
    ctx,
    code,
    codeY,
    `bold ${codeSize}px Arial, Helvetica, sans-serif`,
    innerW
  );

  ctx.font = `${footerSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(exp ? `EXP ${exp}` : "EXP —", padX, footerY);
  ctx.font = `bold ${footerSize}px Arial, Helvetica, sans-serif`;
  const mrp = `MRP ${rate.toFixed(2)}`;
  ctx.fillText(mrp, canvas.width - padX - ctx.measureText(mrp).width, footerY);

  return canvas;
}

/** Render one 50×25 mm label at the printer's native 203 DPI. */
export async function renderLabelPng(product: LabelProduct): Promise<string> {
  return renderLabelCanvas(product).toDataURL("image/png");
}

/** Convert a rendered label into the monochrome bytes required by ESC/POS raster mode. */
export async function renderLabelRaster(product: LabelProduct) {
  const canvas = renderLabelCanvas(product);
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

/** Download label PNG file(s). Safe for POSiFLOW — never sends PostScript. */
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
