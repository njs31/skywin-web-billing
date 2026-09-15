/**
 * Backfill skywin-bill sales into Zoho Books as invoices.
 *
 * Must run where it can reach the `skywin-postgres` container by hostname
 * (i.e. on the same Docker network as the compose stack) and with
 * `.env.production`'s ZOHO_* vars — see the "Production DB" memory. The
 * runtime `skywin-app` image is a pruned Next.js standalone build with no
 * scripts/tsx, so this runs from a one-off container built from the
 * Dockerfile's `builder` stage instead:
 *
 *   ssh root@<vps-ip>
 *   cd /root/skywin-bill
 *   docker build --target builder -t skywin-scripts .
 *   docker run --rm --network skywin-bill_default --env-file .env.production \
 *     skywin-scripts npx tsx scripts/zoho-backfill.ts [--limit N] [--link-only]
 *
 * Modes:
 *  --link-only   Only match already-existing Zoho invoices by invoice number
 *                (for the 3 pushed manually during earlier testing) and save
 *                their IDs back — creates nothing new.
 *  --limit N     Push at most N pending sales (most recent first). Omit for
 *                all pending sales.
 *
 * Only active sales with a customer GSTIN sync (B2B) — this mirrors the
 * `syncSaleToZoho` server action's own rule, since Zoho e-Invoicing is a
 * B2B/GST concept and a B2C sale has no GSTIN to build a Zoho contact from.
 */
import { eq, and, isNull, isNotNull, ne, desc } from "drizzle-orm";
import { db } from "@/db";
import { sales, customers } from "@/db/schema";
import { getSaleById } from "@/lib/queries/sales";
import { toSyncInputs } from "@/lib/actions/einvoice";
import { upsertInvoice } from "@/lib/zoho/sync";
import { zohoRequest } from "@/lib/zoho/client";

const LINK_INVOICE_NUMBERS = [
  "SKYA/0385/26-27",
  "SKYA/0386/26-27",
  "SKYA/0387/26-27",
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function linkExisting() {
  console.log(`Linking ${LINK_INVOICE_NUMBERS.length} already-pushed invoices...`);
  for (const invoiceNo of LINK_INVOICE_NUMBERS) {
    const [sale] = await db
      .select({ id: sales.id, zohoInvoiceId: sales.zohoInvoiceId })
      .from(sales)
      .where(eq(sales.invoiceNo, invoiceNo))
      .limit(1);
    if (!sale) {
      console.log(`  ${invoiceNo}: not found in our database — skipped.`);
      continue;
    }
    if (sale.zohoInvoiceId) {
      console.log(`  ${invoiceNo}: already linked — skipped.`);
      continue;
    }

    const found = await zohoRequest<{
      invoices: { invoice_id: string; customer_id: string }[];
    }>("GET", "/invoices", { query: { invoice_number: invoiceNo } });
    const match = found.invoices?.[0];
    if (!match) {
      console.log(`  ${invoiceNo}: not found in Zoho — skipped.`);
      continue;
    }

    await db
      .update(sales)
      .set({ zohoInvoiceId: match.invoice_id, zohoContactId: match.customer_id })
      .where(eq(sales.id, sale.id));
    console.log(`  ${invoiceNo}: linked to Zoho invoice ${match.invoice_id}.`);
  }
}

async function pushPending(limit: number | null) {
  const pendingIds = await db
    .select({ id: sales.id, invoiceNo: sales.invoiceNo })
    .from(sales)
    .innerJoin(customers, eq(sales.customerId, customers.id))
    .where(
      and(
        ne(sales.status, "cancelled"),
        isNull(sales.zohoInvoiceId),
        isNotNull(customers.gstin),
        ne(customers.gstin, "")
      )
    )
    .orderBy(desc(sales.date), desc(sales.id))
    .limit(limit ?? 100000);

  console.log(
    `${pendingIds.length} B2B sale(s) pending push${limit ? ` (limit ${limit})` : ""}.`
  );

  let pushed = 0;
  let failed = 0;
  const failures: { invoiceNo: string; error: string }[] = [];

  for (const { id, invoiceNo } of pendingIds) {
    try {
      const sale = await getSaleById(id);
      if (!sale) throw new Error("sale disappeared mid-run");
      const { syncSale, customer, items } = toSyncInputs(sale);
      const result = await upsertInvoice({ sale: syncSale, items, customer });
      await db
        .update(sales)
        .set({ zohoInvoiceId: result.zohoInvoiceId, zohoContactId: result.zohoContactId })
        .where(eq(sales.id, id));
      pushed++;
      console.log(`  ✓ ${invoiceNo} -> ${result.zohoInvoiceId}`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ invoiceNo, error: message });
      console.log(`  ✗ ${invoiceNo}: ${message}`);
    }
    // Stay well under Zoho's 100 req/min limit (each invoice costs ~2-3 calls).
    await sleep(400);
  }

  console.log(`\nDone. Pushed ${pushed}, failed ${failed}.`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  ${f.invoiceNo}: ${f.error}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const linkOnly = args.includes("--link-only");
  const limitArg = args.find((a) => a.startsWith("--limit"));
  const limit = limitArg
    ? Number(limitArg.includes("=") ? limitArg.split("=")[1] : args[args.indexOf(limitArg) + 1])
    : null;

  await linkExisting();
  if (!linkOnly) {
    await pushPending(limit);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
