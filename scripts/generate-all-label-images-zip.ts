import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAllLabelPngZip } from "../lib/label-png-zip-export";
import { getAllProductsForLabelPdf } from "../lib/queries/products";

async function main() {
  const products = await getAllProductsForLabelPdf();
  if (products.length === 0) {
    throw new Error("No active products found.");
  }

  console.log(`Rendering ${products.length} live product labels…`);
  const zip = await buildAllLabelPngZip(products);
  const outputDir = join(process.cwd(), "tmp");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, "skywin-all-label-images-50x30.zip");
  writeFileSync(outputPath, zip);
  console.log(`Wrote ${outputPath} (${zip.length} bytes).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
