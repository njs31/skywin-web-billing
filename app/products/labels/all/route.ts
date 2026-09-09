import { getAllProductsForLabelPdf } from "@/lib/queries/products";
import { buildAllLabelsPdf } from "@/lib/label-pdf-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One 50 × 24.5 mm PDF page per product — feed this to the POSiFLOW app's
 * "PDF Printing → Label" flow, or any label printer.
 *
 *   ?ids=1,2,3   just those products, in that order
 *   ?limit=20    the first N active products (by name) — for a quick test
 *   (neither)    every active product
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  const limitParam = url.searchParams.get("limit");

  let products = await getAllProductsForLabelPdf();

  if (idsParam) {
    const ids = idsParam
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    const byId = new Map(products.map((p) => [p.id, p]));
    products = ids.map((id) => byId.get(id)).filter((p): p is (typeof products)[number] => Boolean(p));
  } else {
    const limit = parseInt(limitParam ?? "", 10);
    if (Number.isInteger(limit) && limit > 0) {
      products = products.slice(0, limit);
    }
  }

  if (products.length === 0) {
    return new Response("No matching active products found.", { status: 404 });
  }

  const pdf = await buildAllLabelsPdf(products);
  const date = new Date().toISOString().slice(0, 10);
  const count = products.length;

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="skywin-labels-50x24.5-${count}-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
