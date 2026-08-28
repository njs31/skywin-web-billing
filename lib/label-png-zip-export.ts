import sharp from "sharp";
import { BUSINESS } from "@/lib/business";
import { layoutCode128Bars } from "@/lib/code128";
import {
  LABEL_LAYOUT,
  THERMAL_LABEL_H_PX,
  THERMAL_LABEL_W_PX,
  THERMAL_PRINTER_DPI,
} from "@/lib/label-print-config";
import { toNumber } from "@/lib/utils";

export const LABEL_IMAGE_W_PX = THERMAL_LABEL_W_PX;
export const LABEL_IMAGE_H_PX = THERMAL_LABEL_H_PX;

export type LabelPngProduct = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  saleRate: string;
  gstRate: string;
  expiryDate: string | null;
};

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[char]!;
  });
}

function productCode(product: LabelPngProduct) {
  return (
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

function inclusiveRate(saleRate: string, gstRate: string) {
  return Math.round(toNumber(saleRate) * (1 + toNumber(gstRate) / 100) * 100) / 100;
}

function formatExpiry(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function wrapName(value: string, maxChars: number, maxLines: number) {
  const words = value.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (trial.length <= maxChars) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1]!;
  kept[maxLines - 1] = last.length > maxChars ? `${last.slice(0, maxChars - 1)}…` : last;
  return kept;
}

/** Render one standalone PNG that is ready to send to the POSiFLOW printer. */
export async function renderLabelPng(product: LabelPngProduct): Promise<Buffer> {
  const W = LABEL_IMAGE_W_PX;
  const H = LABEL_IMAGE_H_PX;
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
  const innerW = W - padX * 2;
  const code = productCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate).toFixed(2);
  const expiry = formatExpiry(product.expiryDate) || "—";
  const nameLines = wrapName(product.name, 34, 2);
  const { bars } = layoutCode128Bars(code, padX, innerW);
  const barRects = bars
    .map(
      (bar) =>
        `<rect x="${bar.x}" y="${barcodeY}" width="${bar.width}" height="${barcodeH}" fill="#000000"/>`
    )
    .join("");

  const svg = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <g fill="#000000" font-family="Arial, Helvetica, sans-serif">
        <text x="${W / 2}" y="${companyY + companySize - 2}" text-anchor="middle" font-size="${companySize}" font-weight="700">${escapeXml(BUSINESS.name)}</text>
        <text x="${W / 2}" y="${taglineY + taglineSize - 1}" text-anchor="middle" font-size="${taglineSize}">${escapeXml(BUSINESS.tagline)}</text>
        ${nameLines
          .map(
            (line, index) =>
              `<text x="${W / 2}" y="${nameY + nameSize - 2 + index * nameLineHeight}" text-anchor="middle" font-size="${nameSize}" font-weight="700">${escapeXml(line)}</text>`
          )
          .join("")}
        ${barRects}
        <text x="${W / 2}" y="${codeY + codeSize - 2}" text-anchor="middle" font-size="${codeSize}" font-weight="700">${escapeXml(code)}</text>
        <text x="${padX}" y="${footerY + footerSize - 2}" font-size="${footerSize}">EXP ${escapeXml(expiry)}</text>
        <text x="${W - padX}" y="${footerY + footerSize - 2}" text-anchor="end" font-size="${footerSize}" font-weight="700">MRP ${escapeXml(rate)}</text>
      </g>
    </svg>`;

  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
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

/** Build one PNG per active product, packaged for a single download. */
export async function buildAllLabelPngZip(products: LabelPngProduct[]) {
  const entries: Array<{ name: string; data: Buffer }> = [];
  for (const product of products) {
    entries.push({
      name: `labels/label-${String(product.id).padStart(5, "0")}-${productCode(product).replace(/[^a-zA-Z0-9._-]+/g, "-")}.png`,
      data: await renderLabelPng(product),
    });
  }
  return createZip(entries);
}
