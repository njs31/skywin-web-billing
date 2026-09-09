import sharp from "sharp";
import {
  labelSvgFor,
  productCode,
  type LabelSourceProduct,
} from "@/lib/label-svg";
import {
  LABEL_H_DOTS,
  LABEL_W_DOTS,
  THERMAL_PRINTER_DPI,
} from "@/lib/label-print-config";

export type LabelPngProduct = LabelSourceProduct;

export const LABEL_IMAGE_W_PX = LABEL_W_DOTS;
export const LABEL_IMAGE_H_PX = LABEL_H_DOTS;

/**
 * Render one standalone PNG, pixel-for-pixel the same label the USB path
 * prints — both are drawn from the shared plan in `label-layout`.
 *
 * The label is pure black on white, so a 2-colour palette PNG at a light
 * compression level is a fraction of the size and far quicker to encode than
 * a full RGBA PNG at level 9 — which matters when the catalogue export
 * rasterises this ~1,400 times in one request.
 */
export async function renderLabelPng(product: LabelPngProduct): Promise<Buffer> {
  const svg = labelSvgFor(product);

  return sharp(Buffer.from(svg))
    .png({ palette: true, colours: 2, compressionLevel: 6 })
    .withMetadata({ density: THERMAL_PRINTER_DPI })
    .toBuffer();
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; data: Buffer; crc: number; offset: number };

function createZip(entries: Array<{ name: string; data: Buffer }>) {
  let offset = 0;
  const localFiles: Buffer[] = [];
  const records: ZipEntry[] = [];

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.data.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    localFiles.push(header, name, entry.data);
    records.push({ name: entry.name, data: entry.data, crc, offset });
    offset += header.length + name.length + entry.data.length;
  }

  const centralDirectory = records.map((entry) => {
    const name = Buffer.from(entry.name, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.data.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(entry.offset, 42);
    return Buffer.concat([header, name]);
  });
  const centralSize = centralDirectory.reduce((size, part) => size + part.length, 0);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(records.length, 8);
  footer.writeUInt16LE(records.length, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(offset, 16);

  return Buffer.concat([...localFiles, ...centralDirectory, footer]);
}

/**
 * Build one PNG per active product, packaged for a single download.
 *
 * Rasterised in parallel batches — a serial loop over ~1,400 products spends
 * most of a minute waiting on one sharp call at a time. The batch cap keeps
 * libvips's own thread pool from being swamped.
 */
export async function buildAllLabelPngZip(products: LabelPngProduct[]) {
  const BATCH = 32;
  const entries: Array<{ name: string; data: Buffer }> = [];

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const pngs = await Promise.all(batch.map((product) => renderLabelPng(product)));
    batch.forEach((product, j) => {
      entries.push({
        name: `labels/label-${String(product.id).padStart(5, "0")}-${productCode(product).replace(/[^a-zA-Z0-9._-]+/g, "-")}.png`,
        data: pngs[j]!,
      });
    });
  }

  return createZip(entries);
}
