import QRCode from "qrcode";
import sharp from "sharp";
import { BUSINESS } from "@/lib/business";
import { toNumber } from "@/lib/utils";

/** Individual label image: 35 × 22 mm at 300 DPI. */
export const LABEL_IMAGE_W_PX = 413;
export const LABEL_IMAGE_H_PX = 260;

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
  return value.replace(/[<>&'\"]/g, (char) => {
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
    product.sku?.trim() ||
    product.barcode?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

function scanCode(product: LabelPngProduct) {
  return product.barcode?.trim() || product.sku?.trim() || productCode(product);
}

function inclusiveRate(saleRate: string, gstRate: string) {
  return Math.round(toNumber(saleRate) * (1 + toNumber(gstRate) / 100) * 100) / 100;
}

function formatExpiry(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function shorten(value: string, maxLength: number) {
  const text = value.trim().toUpperCase();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Render one standalone PNG that is ready to send to a label printer. */
export async function renderLabelPng(product: LabelPngProduct): Promise<Buffer> {
  const qrSvg = await QRCode.toString(scanCode(product), {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;
  const code = productCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate).toFixed(2);
  const expiry = formatExpiry(product.expiryDate) || "—";

  const svg = `
    <svg width="${LABEL_IMAGE_W_PX}" height="${LABEL_IMAGE_H_PX}" viewBox="0 0 ${LABEL_IMAGE_W_PX} ${LABEL_IMAGE_H_PX}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect x="1" y="1" width="411" height="258" fill="none" stroke="#000000" stroke-width="1"/>
      <g fill="#000000" font-family="Arial, Helvetica, sans-serif">
        <text x="206.5" y="22" text-anchor="middle" font-size="14" font-weight="700">${escapeXml(BUSINESS.name)}</text>
        <text x="206.5" y="36" text-anchor="middle" font-size="9">(${escapeXml(BUSINESS.tagline)})</text>
        <line x1="12" y1="44" x2="401" y2="44" stroke="#000000" stroke-width="1"/>
        <text x="12" y="63" font-size="13" font-weight="700">${escapeXml(shorten(product.name, 46))}</text>
        <text x="12" y="91" font-size="15" font-weight="700">SKU: ${escapeXml(shorten(code, 25))}</text>
        <text x="12" y="115" font-size="12">EXP: ${escapeXml(expiry)}</text>
        <text x="12" y="143" font-size="16" font-weight="700">RATE: ${escapeXml(rate)}</text>
      </g>
      <image href="${qrDataUrl}" x="286" y="72" width="108" height="108" preserveAspectRatio="none"/>
    </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).withMetadata({ density: 300 }).toBuffer();
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

/**
 * Build an uncompressed ZIP. PNGs are already compressed, so deflating them
 * again adds CPU time with no practical reduction in download size.
 */
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
