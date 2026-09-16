/**
 * One-off: replicate generateEwb's "refresh contact, then push" sequence
 * directly, to verify the shipping-address fix actually reaches an
 * already-synced customer's contact before retrying the e-way bill push.
 */
import { getSaleById } from "@/lib/queries/sales";
import { toSyncInputs, ensureContact } from "@/lib/zoho/sync";
import { generateEwayBill } from "@/lib/zoho/eway";

async function main() {
  const saleId = Number(process.argv[2]);
  if (!saleId) throw new Error("Usage: zoho-test-refresh-then-ewb.ts <saleId>");

  const sale = await getSaleById(saleId);
  if (!sale?.zohoInvoiceId) throw new Error("no zoho invoice id");

  const { customer } = toSyncInputs(sale);
  console.log(`Refreshing contact for "${customer.name}"...`);
  await ensureContact(customer);
  console.log("Contact refreshed. Pushing e-Way Bill...");

  const ewb = await generateEwayBill(sale.zohoInvoiceId, {
    vehicleNumber: sale.vehicleNo ?? undefined,
    transporterName: sale.transporterName ?? undefined,
    distanceKm: sale.distanceKm != null ? Number(sale.distanceKm) : undefined,
  });
  console.log(JSON.stringify(ewb, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
