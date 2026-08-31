/**
 * The label as SVG.
 *
 * Shared by the PNG/ZIP download and by the server-side ESC/POS renderer that
 * feeds the Android app, so a phone print, a downloaded PNG and the PDF sheet
 * are the same artwork. Everything comes from the plan in `label-layout`.
 */
import { buildLabelPlan, type LabelPlan, type LabelPlanFields } from "@/lib/label-layout";
import { toNumber } from "@/lib/utils";

export type LabelSourceProduct = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  saleRate: string;
  gstRate: string;
  expiryDate: string | null;
};

export function escapeXml(value: string) {
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

/** Takes only the identity fields, so callers that select fewer columns work. */
export function productCode(product: {
  id: number;
  sku: string | null;
  barcode: string | null;
}) {
  return (
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

/** The shelf price: sale rate with GST folded in, which is what the MRP shows. */
export function inclusiveRate(saleRate: string, gstRate: string) {
  return Math.round(toNumber(saleRate) * (1 + toNumber(gstRate) / 100) * 100) / 100;
}

export function formatExpiry(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function labelFieldsFor(product: LabelSourceProduct): LabelPlanFields {
  return {
    code: productCode(product),
    name: product.name.toUpperCase(),
    mrp: inclusiveRate(product.saleRate, product.gstRate).toFixed(2),
    exp: formatExpiry(product.expiryDate),
  };
}

export function labelPlanToSvg(plan: LabelPlan) {
  const bars = plan.bars
    .map(
      (bar) =>
        `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" fill="#000000" shape-rendering="crispEdges"/>`
    )
    .join("");

  const texts = plan.texts
    .map(
      (item) =>
        `<text x="${item.x}" y="${item.baseline}" text-anchor="${item.anchor}" font-size="${item.size}"${item.bold ? ' font-weight="700"' : ""}>${escapeXml(item.text)}</text>`
    )
    .join("");

  return (
    `<svg width="${plan.widthDots}" height="${plan.heightDots}" viewBox="0 0 ${plan.widthDots} ${plan.heightDots}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<g fill="#000000" font-family="Arial, Helvetica, sans-serif">${bars}${texts}</g>` +
    `</svg>`
  );
}

export function labelSvgFor(product: LabelSourceProduct) {
  return labelPlanToSvg(buildLabelPlan(labelFieldsFor(product)));
}
