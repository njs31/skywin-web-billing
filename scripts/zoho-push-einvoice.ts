/**
 * One-off: push the e-Invoice (IRN) for a single sale, same logic as the
 * generateIrn server action but callable without a request/session — see
 * zoho-backfill.ts's header for how to run this on the VPS.
 *
 *   npx tsx scripts/zoho-push-einvoice.ts <saleId>
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { getSaleById } from "@/lib/queries/sales";
import { pushEInvoice } from "@/lib/zoho/einvoice";

async function main() {
  const saleId = Number(process.argv[2]);
  if (!saleId) throw new Error("Usage: zoho-push-einvoice.ts <saleId>");

  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (!sale.zohoInvoiceId) throw new Error("Sale isn't synced to Zoho yet.");
  if (sale.irn) throw new Error(`Already has an IRN: ${sale.irn}`);

  try {
    const pushed = await pushEInvoice(sale.zohoInvoiceId);
    await db
      .update(sales)
      .set({
        einvoiceStatus: pushed.irn ? "pushed" : "pending",
        irn: pushed.irn,
        einvoiceRaw: JSON.stringify(pushed.raw),
        einvoiceError: null,
      })
      .where(eq(sales.id, saleId));
    console.log(JSON.stringify(pushed, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sales)
      .set({ einvoiceStatus: "failed", einvoiceError: message })
      .where(eq(sales.id, saleId));
    console.error("Push failed:", message);
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
