/**
 * Build the 38 × 25 mm bulk label PDF (for an outside print shop, not the
 * thermal printer) from a JSON dump of in-stock products.
 *
 * The live database isn't reachable from a dev machine (it's the
 * `skywin-postgres` container on the VPS — see the "Production DB" memory),
 * so this reads a JSON file instead of querying directly. Produce that file
 * with, from a machine that can SSH to the VPS:
 *
 *   ssh root@<vps-ip> "cd /root/skywin-bill && docker compose exec -T postgres \
 *     sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At'" \
 *     <<'SQL' > instock.json
 *   select coalesce(json_agg(t order by t.name), '[]'::json)
 *   from (
 *     select id, name, sku, barcode,
 *            sale_rate::text as "saleRate",
 *            gst_rate::text as "gstRate",
 *            to_char(expiry_date, 'YYYY-MM-DD') as "expiryDate"
 *     from products
 *     where is_active = true and coalesce(stock_qty, 0) > 0
 *   ) t;
 *   SQL
 *
 * Run: npx tsx scripts/generate-bulk-labels.ts instock.json out.pdf [38x25|50x30]
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildBulkLabelsPdf,
  buildBulkLabelsPdf50x30,
  type BulkLabelProduct,
} from "../lib/bulk-label-pdf";

async function main() {
  const jsonPath = process.argv[2];
  const outPath = process.argv[3];
  const size = process.argv[4] === "50x30" ? "50x30" : "38x25";
  if (!jsonPath || !outPath) {
    console.error(
      "Usage: generate-bulk-labels.ts <products.json> <out.pdf> [38x25|50x30]"
    );
    process.exit(1);
  }

  const products: BulkLabelProduct[] = JSON.parse(readFileSync(jsonPath, "utf8"));
  if (products.length === 0) {
    console.error("No products in the input file.");
    process.exit(1);
  }

  console.log(`Building ${size}mm labels for ${products.length} products…`);
  const pdf =
    size === "50x30" ? buildBulkLabelsPdf50x30(products) : buildBulkLabelsPdf(products);
  writeFileSync(outPath, pdf);
  console.log(`Wrote ${outPath} (${pdf.length} bytes, ${products.length} labels)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
