/**
 * Render print-ready TSPL bytes on the server, for a real TSPL printer
 * (e.g. a TSC TE244) — the server-side counterpart to label-escpos-server.ts.
 *
 * Same reasoning as that file: the browser builds its raster from a
 * canvas, which doesn't exist in Node, so this rasterises the same SVG
 * with sharp instead. `buildTsplJob` itself (lib/tspl-print.ts) is pure
 * byte-building with no browser APIs, so it's reused as-is here — only
 * the raster has to be produced a different way.
 *
 * Unlike the ESC/POS path, this does NOT crop to a "printable band": a
 * calibrated TSPL printer positions the whole declared SIZE/GAP media
 * itself, so the full canvas is rasterised uncropped — see
 * renderLabelRasterTspl in label-render.ts, which this mirrors.
 */
import sharp from "sharp";
import { buildLabelPlan, buildTestLabelPlan } from "@/lib/label-layout";
import { buildTsplJob, concatBytes } from "@/lib/tspl-print";
import type { LabelRaster } from "@/lib/label-render";
import {
  labelPlanToSvg,
  labelFieldsFor,
  type LabelSourceProduct,
} from "@/lib/label-svg";
import { INK_THRESHOLD, TSPL_GEOMETRY } from "@/lib/label-print-config";

async function rasterFromSvgFull(svg: string): Promise<LabelRaster> {
  const { data, info } = await sharp(Buffer.from(svg))
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

export async function renderLabelRasterTsplServer(
  product: LabelSourceProduct
): Promise<LabelRaster> {
  const plan = buildLabelPlan(labelFieldsFor(product), TSPL_GEOMETRY);
  return rasterFromSvgFull(labelPlanToSvg(plan));
}

export async function renderTestLabelRasterTsplServer(): Promise<LabelRaster> {
  return rasterFromSvgFull(labelPlanToSvg(buildTestLabelPlan(TSPL_GEOMETRY)));
}

export type TsplLabelPrintRequest = {
  product: LabelSourceProduct;
  copies: number;
};

/**
 * A finished TSPL job for a run of products. Each product gets its own
 * self-contained SIZE/GAP/CLS/BITMAP/PRINT block (TSPL allows several such
 * blocks concatenated in one job), and `PRINT 1,<copies>` inside each
 * block is the printer's own repeat — see buildTsplJob for why that
 * matters more here than anywhere else in this app's printing code.
 */
export async function buildTsplForProducts(
  requests: TsplLabelPrintRequest[]
): Promise<Uint8Array> {
  const jobs: Uint8Array[] = [];
  for (const { product, copies } of requests) {
    const raster = await renderLabelRasterTsplServer(product);
    jobs.push(buildTsplJob(raster, copies));
  }
  return concatBytes(jobs);
}
