/**
 * One-off: delete a Zoho invoice by ID and clear the linkage on our side,
 * so a subsequent backfill run recreates it cleanly with fixed logic.
 * Run the same way as zoho-backfill.ts (see that file's header comment).
 *
 *   npx tsx scripts/zoho-delete-invoice.ts <saleId> <zohoInvoiceId>
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { zohoRequest } from "@/lib/zoho/client";

async function main() {
  const [saleIdArg, zohoInvoiceId] = process.argv.slice(2);
  const saleId = Number(saleIdArg);
  if (!saleId || !zohoInvoiceId) {
    throw new Error("Usage: zoho-delete-invoice.ts <saleId> <zohoInvoiceId>");
  }

  await zohoRequest("DELETE", `/invoices/${zohoInvoiceId}`);
  console.log(`Deleted Zoho invoice ${zohoInvoiceId}.`);

  await db
    .update(sales)
    .set({
      zohoInvoiceId: null,
      zohoContactId: null,
      einvoiceStatus: "none",
      irn: null,
      einvoiceError: null,
      einvoiceRaw: null,
    })
    .where(eq(sales.id, saleId));
  console.log(`Cleared Zoho linkage on sale ${saleId}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
