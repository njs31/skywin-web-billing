import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAllProductsForLabelPdf } from "../lib/queries/products";
import { buildAllLabelsPdf } from "../lib/label-pdf-export";

async function main() {
  const products = await getAllProductsForLabelPdf();
  if (products.length === 0) {
    console.error("No active products found.");
    process.exit(1);
  }

  console.log(`Generating PDF for ${products.length} products…`);
  const pdf = await buildAllLabelsPdf(products);

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "skywin-all-labels-35x22.pdf");
  writeFileSync(outPath, pdf);

  console.log(`Wrote ${outPath} (${pdf.length} bytes, ${products.length} labels)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
