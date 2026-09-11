/**
 * Build the 38 × 25 mm bulk label PDF with one label per physical stock
 * unit, for products under a stock-quantity ceiling.
 *
 * `stock_qty` isn't always "how many stickers to print" — for products
 * measured in grams/ML/KG, or seed packets counted in the thousands, one
 * label per unit is absurd (a single product pushed a naive full-catalogue
 * run past 700,000 pages). So this only applies the per-unit-copy rule
 * below a ceiling (default 50) meant to catch genuinely small, discrete
 * stock — baskets, bottles, a handful of units — and skips everything at
 * or above it entirely, on request.
 *
 * The live database isn't reachable from a dev machine (it's the
 * `skywin-postgres` container on the VPS — see the "Production DB" memory),
 * so this reads a JSON dump instead of querying directly. Produce it with,
 * from a machine that can SSH to the VPS (adjust the ceiling in `< 50`):
 *
 *   ssh root@<vps-ip> "cd /root/skywin-bill && docker compose exec -T postgres \
 *     sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At'" \
 *     <<'SQL' > lowstock.json
 *   select coalesce(json_agg(t order by t.name), '[]'::json)
 *   from (
 *     select id, name, sku, barcode,
 *            sale_rate::text as "saleRate",
 *            gst_rate::text as "gstRate",
 *            to_char(expiry_date, 'YYYY-MM-DD') as "expiryDate",
 *            floor(stock_qty)::int as "stockQty"
 *     from products
 *     where is_active = true and coalesce(stock_qty, 0) > 0 and stock_qty < 50
 *   ) t;
 *   SQL
 *
 * Run: npx tsx scripts/generate-labels-by-stock.ts lowstock.json out.pdf
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildBulkLabelsPdf, type BulkLabelProduct } from "../lib/bulk-label-pdf";

type Row = BulkLabelProduct & { stockQty: number };

async function main() {
  const jsonPath = process.argv[2];
  const outPath = process.argv[3];
  if (!jsonPath || !outPath) {
    console.error("Usage: generate-labels-by-stock.ts <products.json> <out.pdf>");
    process.exit(1);
  }

  const rows: Row[] = JSON.parse(readFileSync(jsonPath, "utf8"));
  if (rows.length === 0) {
    console.error("No products in the input file.");
    process.exit(1);
  }

  const expanded: BulkLabelProduct[] = [];
  for (const p of rows) {
    const copies = Math.max(0, Math.floor(p.stockQty));
    for (let i = 0; i < copies; i++) expanded.push(p);
  }

  console.log(`${rows.length} products, ${expanded.length} labels (one per stock unit)…`);
  const pdf = buildBulkLabelsPdf(expanded);
  writeFileSync(outPath, pdf);
  console.log(`Wrote ${outPath} (${pdf.length} bytes, ${expanded.length} labels)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
