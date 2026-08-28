import { getAllProductsForLabelPdf } from "@/lib/queries/products";
import { buildAllLabelsPdf } from "@/lib/label-pdf-export";

export const runtime = "nodejs";

export async function GET() {
  const products = await getAllProductsForLabelPdf();

  if (products.length === 0) {
    return new Response("No active products found.", { status: 404 });
  }

  const pdf = await buildAllLabelsPdf(products);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="skywin-all-labels-35x22-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
