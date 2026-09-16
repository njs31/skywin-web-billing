/**
 * One-off: fully recreate sale 908's Zoho invoice and e-way bill shell,
 * now that the contact has both billing_address and shipping_address set
 * correctly — both the invoice and the e-way bill shell were created
 * before that fix existed, and (like the address-truncation case) Zoho
 * appears to snapshot ship-to details at creation time, not read them
 * live from the contact on every push.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { zohoRequest } from "@/lib/zoho/client";
import { deleteEwayBillShell } from "@/lib/zoho/eway";
import { getSaleById } from "@/lib/queries/sales";
import { upsertInvoice, toSyncInputs } from "@/lib/zoho/sync";

async function main() {
  const saleId = 908;
  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("sale not found");

  if (sale.ewbId) {
    try {
      await deleteEwayBillShell(sale.ewbId);
      console.log(`Deleted e-way bill shell ${sale.ewbId}.`);
    } catch (e) {
      console.log(`Delete e-way bill shell failed (continuing): ${e}`);
    }
  }
  if (sale.zohoInvoiceId) {
    await zohoRequest("DELETE", `/invoices/${sale.zohoInvoiceId}`);
    console.log(`Deleted invoice ${sale.zohoInvoiceId}.`);
  }

  await db
    .update(sales)
    .set({
      zohoInvoiceId: null,
      zohoContactId: null,
      ewbId: null,
      ewbNo: null,
      ewbStatus: "none",
      ewbGeneratedAt: null,
      ewbValidUntil: null,
      ewbError: null,
      ewbRaw: null,
    })
    .where(eq(sales.id, saleId));
  console.log("Cleared linkage.");

  const fresh = await getSaleById(saleId);
  if (!fresh) throw new Error("sale disappeared");
  const { syncSale, customer, items } = toSyncInputs(fresh);
  const result = await upsertInvoice({ sale: syncSale, items, customer });
  await db
    .update(sales)
    .set({ zohoInvoiceId: result.zohoInvoiceId, zohoContactId: result.zohoContactId })
    .where(eq(sales.id, saleId));
  console.log("Recreated invoice:", result.zohoInvoiceId);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
