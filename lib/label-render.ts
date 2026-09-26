/**
 * Browser-side label rendering: the on-screen preview, the PNG download and
 * the bitmap that goes down the USB cable all come out of one canvas, so they
 * can never drift apart.
 */
import {
  buildLabelPlan,
  buildTestLabelPlan,
  type LabelPlan,
} from "@/lib/label-layout";
import {
  INK_THRESHOLD,
  P58D_GEOMETRY,
  TSPL_GEOMETRY,
  type LabelGeometry,
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

export type LabelRaster = {
  width: number;
  height: number;
  bytesPerRow: number;
  /** 1 bit per dot, MSB first, **1 = ink**. TSPL inverts this; ESC/POS does not. */
  bytes: Uint8Array;
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
    name: product.name.toUpperCase(),
    mrp: inclusiveRate(product.saleRate, product.gstRate).toFixed(2),
    exp: formatExp(product.expiryDate),
  };
}

export function planFor(
  product: LabelProduct,
  geometry: LabelGeometry = P58D_GEOMETRY
): LabelPlan {
  return buildLabelPlan(getLabelFields(product), geometry);
}

export function drawLabelPlan(ctx: CanvasRenderingContext2D, plan: LabelPlan) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, plan.widthDots, plan.heightDots);

  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";

  // Bars sit on exact dot boundaries, so no anti-aliasing can smear them.
  for (const bar of plan.bars) {
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
  }

  for (const item of plan.texts) {
    ctx.font = `${item.bold ? "bold " : ""}${item.size}px Arial, Helvetica, sans-serif`;
    ctx.textAlign =
      item.anchor === "middle" ? "center" : item.anchor === "end" ? "right" : "left";
    ctx.fillText(item.text, item.x, item.baseline);
  }
}

function renderPlanCanvas(plan: LabelPlan) {
  const canvas = document.createElement("canvas");
  canvas.width = plan.widthDots;
  canvas.height = plan.heightDots;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");
  drawLabelPlan(ctx, plan);
  return canvas;
}

function renderLabelCanvas(product: LabelProduct, geometry: LabelGeometry = P58D_GEOMETRY) {
  return renderPlanCanvas(planFor(product, geometry));
}

/** Render one label at the printer's native dot pitch (P58D geometry). */
export async function renderLabelPng(product: LabelProduct): Promise<string> {
  return renderLabelCanvas(product).toDataURL("image/png");
}

/**
 * Pack the label into 1-bit rows for the printer.
 *
 * Crops to the window the head can actually reach, in both directions.
 *
 * Horizontally: the label is 400 dots wide but a 2-inch head may be just 384.
 * Vertically: after a `GS FF` gap seek the paper is parked 5 mm past the die
 * cut, so row 0 of the artwork would land 5 mm down the sticker and the last
 * 5 mm of a full-height image would be pushed over the next die cut — which is
 * exactly how the code digits, EXP and MRP ended up stranded on the following
 * sticker. Sending only rows 40..224 puts the artwork where it was drawn.
 *
 * This crop is a P58D-specific workaround for its unmanaged gap-seek park
 * position — see renderLabelRasterTspl below for why a real TSPL printer
 * needs none of this.
 */
export async function renderLabelRaster(
  product: LabelProduct
): Promise<LabelRaster> {
  return rasterFromCanvasCropped(renderLabelCanvas(product, P58D_GEOMETRY), P58D_GEOMETRY);
}

/** The diagnostic label, packed the same way a product label is. */
export async function renderTestLabelRaster(): Promise<LabelRaster> {
  return rasterFromCanvasCropped(
    renderPlanCanvas(buildTestLabelPlan(P58D_GEOMETRY)),
    P58D_GEOMETRY
  );
}

/**
 * The TSPL equivalent of renderLabelRaster — same layout engine, same
 * canvas, but the *whole* canvas is packed, uncropped, at (0,0). A real
 * TSPL printer declares its own media size via `SIZE`/`GAP` and calibrates
 * its gap sensor against that, so there is no unmanaged "park position" to
 * crop around: whatever is drawn at row 0 of the canvas lands at row 0 of
 * the sticker. See lib/tspl-print.ts.
 */
export async function renderLabelRasterTspl(product: LabelProduct): Promise<LabelRaster> {
  return rasterFromCanvasFull(renderLabelCanvas(product, TSPL_GEOMETRY));
}

/** The diagnostic label for a TSPL printer. */
export async function renderTestLabelRasterTspl(): Promise<LabelRaster> {
  return rasterFromCanvasFull(renderPlanCanvas(buildTestLabelPlan(TSPL_GEOMETRY)));
}

function packGreyscale(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      const luminance =
        pixels[pixel]! * 0.2126 +
        pixels[pixel + 1]! * 0.7152 +
        pixels[pixel + 2]! * 0.0722;
      if (luminance < INK_THRESHOLD) {
        bytes[y * bytesPerRow + (x >> 3)]! |= 0x80 >> (x & 7);
      }
    }
  }
  return bytes;
}

function rasterFromCanvasCropped(
  canvas: HTMLCanvasElement,
  geometry: LabelGeometry
): LabelRaster {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");

  const height = geometry.printBandHDots;
  const width = geometry.printWDots;
  const pixels = ctx.getImageData(
    geometry.printXDots,
    geometry.printBandTopDots,
    width,
    height
  ).data;
  const bytesPerRow = Math.ceil(width / 8);
  return { width, height, bytesPerRow, bytes: packGreyscale(pixels, width, height) };
}

/** No crop — the whole canvas, for a printer that positions its own media. */
function rasterFromCanvasFull(canvas: HTMLCanvasElement): LabelRaster {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");

  const width = canvas.width;
  const height = canvas.height;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  return { width, height, bytesPerRow, bytes: packGreyscale(pixels, width, height) };
}

export async function renderLabelPngMap(products: LabelProduct[]) {
  const map: Record<number, string> = {};
  for (const product of products) {
    map[product.id] = await renderLabelPng(product);
  }
  return map;
}

function triggerDownload(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

/** Download label PNG file(s) for the printer's own phone app. */
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
      triggerDownload(png, qty > 1 ? `${base}-${i + 1}.png` : `${base}.png`);
    }
  }
}

export async function downloadLabelPng(product: LabelProduct) {
  triggerDownload(
    await renderLabelPng(product),
    `label-${productCode(product)}.png`
  );
}
