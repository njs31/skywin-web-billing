import { getAllProductsForLabelPdf } from "@/lib/queries/products";
import { buildAllLabelPngZip } from "@/lib/label-png-zip-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download a fresh, print-ready PNG label for every active product. */
export async function GET() {
  const products = await getAllProductsForLabelPdf();
  if (products.length === 0) {
    return new Response("No active products found.", { status: 404 });
  }

  const zip = await buildAllLabelPngZip(products);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="skywin-all-label-images-50x25-${date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
