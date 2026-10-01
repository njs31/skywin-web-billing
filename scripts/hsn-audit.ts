/**
 * READ-ONLY HSN master audit for the e-invoice staging work.
 *
 * Lists every product whose HSN would fail IRP validation (this business
 * must report 6- or 8-digit numeric HSN — Notification 78/2020, AATO > 5cr)
 * plus how many invoice lines use each HSN. Prints a human report to
 * stdout; exits non-zero only on connection/query failure.
 *
 * SAFETY: this file contains no INSERT/UPDATE/DELETE/DDL — SELECT only.
 * It refuses to run unless `--target=staging` is passed AND the resolved
 * host is not the production database host. Run it as:
 *
 *   tsx --env-file=<staging-env-file> scripts/hsn-audit.ts --target=staging
 *
 * NEVER point it at production. It changes nothing, but production data
 * must not be copied into staging logs.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

const PRODUCTION_HOSTS = ["187.127.216.26", "skywin", "qwicksapp.com"];

function redactUrl(url: string): string {
  return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://$1:***@");
}

function classify(raw: string | null): string {
  const code = (raw ?? "").trim().replace(/\s/g, "");
  if (!code) return "blank";
  if (!/^[0-9]+$/.test(code)) return "non-numeric";
  if (code.length === 4) return "4-digit";
  if (code.length === 5) return "5-digit";
  if (code.length === 6) return "6-digit";
  if (code.length === 8) return "8-digit";
  return `other-length-${code.length}`;
}

/** Mirrors validateHsn() in lib/whitebooks/irn-payload.ts (AATO > 5cr). */
function passesIrpRule(raw: string | null): boolean {
  const code = (raw ?? "").trim().replace(/\s/g, "");
  return /^[0-9]{6}([0-9]{2})?$/.test(code);
}

type ProductRow = {
  id: number;
  name: string;
  hsn_code: string | null;
  lines: string;
};

type CustomRow = {
  name: string;
  hsn_code: string | null;
  lines: string;
};

type DistRow = {
  hsn: string | null;
  lines: string;
};

async function main() {
  if (!process.argv.includes("--target=staging")) {
    throw new Error(
      "Refusing to run: pass --target=staging and a STAGING DATABASE_URL. Never audit production."
    );
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL is not set.");
  const host = redactUrl(url);
  console.log(`target host: ${host}`);
  if (PRODUCTION_HOSTS.some((h) => url.includes(h))) {
    throw new Error(
      `Refusing to run: target looks like production (${host}). Use a staging database.`
    );
  }

  const products = (await db.execute(sql`
    select p.id, p.name, p.hsn_code, count(si.id)::text as lines
    from products p
    left join sale_items si on si.product_id = p.id
    group by p.id, p.name, p.hsn_code
    order by p.id
  `)) as unknown as ProductRow[];

  const customLines = (await db.execute(sql`
    select coalesce(nullif(trim(si.custom_name), ''), '(unnamed)') as name,
           si.hsn_code, count(*)::text as lines
    from sale_items si
    where si.product_id is null
    group by 1, 2
    order by count(*) desc
  `)) as unknown as CustomRow[];

  const distribution = (await db.execute(sql`
    select coalesce(si.hsn_code, p.hsn_code) as hsn, count(*)::text as lines
    from sale_items si
    left join products p on p.id = si.product_id
    group by 1
    order by count(*) desc
  `)) as unknown as DistRow[];

  const buckets = new Map<string, { products: number; lines: number }>();
  const needsReview: Array<{
    id: number;
    name: string;
    hsn: string | null;
    bucket: string;
    lines: number;
  }> = [];

  for (const p of products) {
    const bucket = classify(p.hsn_code);
    const lines = Number(p.lines);
    const b = buckets.get(bucket) ?? { products: 0, lines: 0 };
    b.products += 1;
    b.lines += lines;
    buckets.set(bucket, b);
    if (!passesIrpRule(p.hsn_code)) {
      needsReview.push({
        id: p.id,
        name: p.name,
        hsn: p.hsn_code,
        bucket,
        lines,
      });
    }
  }

  const customBad = customLines.filter((r) => !passesIrpRule(r.hsn_code));

  console.log("\n=== HSN AUDIT: product master buckets ===");
  for (const [bucket, b] of [...buckets.entries()].sort()) {
    console.log(
      `${bucket}: ${b.products} product(s), ${b.lines} invoice line(s)`
    );
  }

  console.log("\n=== PRODUCTS REQUIRING REVIEW (would fail IRP push) ===");
  if (needsReview.length === 0) console.log("(none)");
  for (const r of needsReview) {
    console.log(
      `#${r.id} | ${r.name} | hsn=${r.hsn ?? "(blank)"} | ${r.bucket} | ${r.lines} line(s)`
    );
  }

  console.log("\n=== CUSTOM (non-inventory) LINES WITH BAD HSN ===");
  if (customBad.length === 0) console.log("(none)");
  for (const r of customBad) {
    console.log(
      `${r.name} | hsn=${r.hsn_code ?? "(blank)"} | ${r.lines} line(s)`
    );
  }

  console.log("\n=== EFFECTIVE LINE-HSN DISTRIBUTION (line override else product) ===");
  for (const r of distribution) {
    console.log(
      `${r.hsn ?? "(blank)"} [${classify(r.hsn)}] : ${r.lines} line(s)`
    );
  }

  console.log(
    `\nSUMMARY: ${products.length} products, ${needsReview.length} need review; ` +
      `${customBad.length} custom-line HSN group(s) need review.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
