/**
 * One-off: push the e-Way Bill for a single sale, same logic as the
 * generateEwb server action but callable without a request/session — see
 * zoho-backfill.ts's header for how to run this on the VPS.
 *
 *   npx tsx scripts/zoho-push-ewb.ts <saleId>
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { getSaleById } from "@/lib/queries/sales";
import { generateEwayBill, type DispatchDetails } from "@/lib/zoho/eway";

async function main() {
  const saleId = Number(process.argv[2]);
  if (!saleId) throw new Error("Usage: zoho-push-ewb.ts <saleId>");

  const sale = await getSaleById(saleId);
  if (!sale) throw new Error("Sale not found.");
  if (!sale.zohoInvoiceId) throw new Error("Sale isn't synced to Zoho yet.");
  if (sale.ewbNo) throw new Error(`Already has an e-way bill: ${sale.ewbNo}`);

  const dispatch: DispatchDetails = {
    vehicleNumber: sale.vehicleNo ?? undefined,
    transporterName: sale.transporterName ?? undefined,
    transporterGstin: sale.transporterGstin ?? undefined,
    distanceKm: sale.distanceKm != null ? Number(sale.distanceKm) : undefined,
  };

  try {
    const ewb = await generateEwayBill(sale.zohoInvoiceId, dispatch);
    console.log("Result:", JSON.stringify(ewb, null, 2));

    const parsedGeneratedAt = ewb.ewaybill_date ? new Date(ewb.ewaybill_date) : null;
    const generatedAt =
      parsedGeneratedAt && !Number.isNaN(parsedGeneratedAt.getTime())
        ? parsedGeneratedAt
        : new Date();

    await db
      .update(sales)
      .set({
        ewbStatus: ewb.ewaybill_number ? "generated" : "pending",
        ewbId: ewb.ewaybill_id || null,
        ewbNo: ewb.ewaybill_number || null,
        ewbGeneratedAt: ewb.ewaybill_number ? generatedAt : null,
        ewbValidUntil: ewb.ewaybill_expiry_date ? new Date(ewb.ewaybill_expiry_date) : null,
        ewbRaw: JSON.stringify(ewb),
        ewbError: null,
      })
      .where(eq(sales.id, saleId));
    console.log("Saved to sale.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sales)
      .set({ ewbStatus: "failed", ewbError: message })
      .where(eq(sales.id, saleId));
    console.error("Push failed:", message);
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
