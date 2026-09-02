/**
 * Render print-ready ESC/POS bytes on the server.
 *
 * The browser builds its raster from a canvas, which does not exist in Node.
 * The Android app has no label engine at all — it is a pipe from this endpoint
 * to a Bluetooth socket. So the label is rasterised here with sharp, from the
 * same SVG the PNG download uses, and packed with the same bit convention the
 * WebUSB path uses. One label design, three transports.
 */
import sharp from "sharp";
import { buildEscPosJob } from "@/lib/escpos-print";
import { buildTestLabelPlan } from "@/lib/label-layout";
import type { LabelRaster } from "@/lib/label-render";
import {
  labelPlanToSvg,
  labelSvgFor,
  type LabelSourceProduct,
} from "@/lib/label-svg";
import {
  INK_THRESHOLD,
  PRINT_BAND_H_DOTS,
  PRINT_BAND_TOP_DOTS,
  PRINT_W_DOTS,
  PRINT_X_DOTS,
} from "@/lib/label-print-config";



/**
 * Rasterise one label into the window the head can reach.
 *
 * The same crop the browser applies: 384 dots wide out of 400, and rows
 * 40..224 out of 240, because the gap seek parks the paper 5 mm past the die
 * cut and the sticker ends before the artwork does. See renderLabelRaster.
 */
export async function renderLabelRasterServer(
  product: LabelSourceProduct
): Promise<LabelRaster> {
  return rasterFromSvg(labelSvgFor(product));
}

/** The diagnostic label, rasterised exactly like a product label. */
export async function renderTestLabelRasterServer(): Promise<LabelRaster> {
  return rasterFromSvg(labelPlanToSvg(buildTestLabelPlan()));
}

async function rasterFromSvg(svg: string): Promise<LabelRaster> {
  const { data, info } = await sharp(Buffer.from(svg))
    .extract({
      left: PRINT_X_DOTS,
      top: PRINT_BAND_TOP_DOTS,
      width: PRINT_W_DOTS,
      height: PRINT_BAND_H_DOTS,
    })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x]! < INK_THRESHOLD) {
        bytes[y * bytesPerRow + (x >> 3)]! |= 0x80 >> (x & 7);
      }
    }
  }

  return { width, height, bytesPerRow, bytes };
}

export type LabelPrintRequest = {
  product: LabelSourceProduct;
  copies: number;
  /** Liner gap to feed after each label, in dots. Defaults to the roll spec. */
  feedDots?: number;
};

/**
 * A finished ESC/POS job for a run of products, ready to write to a socket.
 *
 * Built as one job rather than one per product, because the job ends by
 * advancing the last label clear of the tear bar and that costs a blank
 * sticker. Per product it would cost one per product; here a run of twenty
 * pays it once.
 *
 * Copies are expanded here for the same reason: `buildEscPosJob` applies a
 * single copy count to every raster it is given, and a run can ask for
 * different counts per product.
 */
export async function buildEscPosForProducts(
  requests: LabelPrintRequest[],
  options: { presentDots?: number } = {}
) {
  const rasters: LabelRaster[] = [];
  for (const { product, copies } of requests) {
    const raster = await renderLabelRasterServer(product);
    const count = Math.max(1, Math.min(99, Math.trunc(copies)));
    for (let i = 0; i < count; i++) rasters.push(raster);
  }

  // One gap override applies to the whole run: it describes the roll, and the
  // print route takes it from a single query parameter.
  const feedDots = requests.find((request) => request.feedDots !== undefined)?.feedDots;
  return buildEscPosJob(rasters, { feedDots, presentDots: options.presentDots });
}
