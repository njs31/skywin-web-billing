import { getAllProductsForStockLabelPdf } from "@/lib/queries/products";
import { buildStockLabelsPdf } from "@/lib/label-pdf-export";
import { toNumber } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guard the roll: a mistaken stock count should not print thousands of stickers. */
const MAX_LABELS = 5000;

/**
 * One 50 × 24.5 mm PDF page per unit in stock — a product with stockQty 100
 * yields 100 pages, so the roll comes off ready to stick on every unit.
 *
 *   ?ids=1,2,3   just those products (still one page per unit of stock), in that order
 *   (none)       every active product with stock > 0
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");

  let products = await getAllProductsForStockLabelPdf();

  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    const byId = new Map(products.map((p) => [p.id, p]));
    products = ids.map((id) => byId.get(id)).filter((p): p is (typeof products)[number] => Boolean(p));
  }

  if (products.length === 0) {
    return new Response("No in-stock products found.", { status: 404 });
  }

  const totalLabels = products.reduce((sum, p) => sum + Math.floor(toNumber(p.stockQty)), 0);
  if (totalLabels > MAX_LABELS) {
    return new Response(
      `Requested ${totalLabels} labels, which exceeds the ${MAX_LABELS} limit. Narrow the request with ?ids=1,2,3.`,
      { status: 413 }
    );
  }

  const pdf = await buildStockLabelsPdf(products);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="skywin-stock-labels-50x24.5-${totalLabels}-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
