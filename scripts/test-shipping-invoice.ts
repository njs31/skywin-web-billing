/**
 * Delivery rates + invoice, end to end on a THROWAWAY local database (never the live one).
 *   DATABASE_URL=postgres://test@127.0.0.1:55432/skywin npx tsx scripts/test-shipping-invoice.ts
 */
import Module from "node:module";
import assert from "node:assert/strict";
const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "next/cache") return { revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn: Function) => fn };
  return originalLoad(request, parent, isMain);
};
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL || "")) {
  console.error("Refusing to run: DATABASE_URL must point at a local test database.");
  process.exit(1);
}

async function main() {
  const { db } = await import("@/db");
  const { sql, eq } = await import("drizzle-orm");
  const { products, productBatches, shippingRates, pinLocations, saleItems, sales } = await import("@/db/schema");
  const { calculateManualShippingRate } = await import("@/lib/delivery/manual-rates");
  const { placeFieldOrder } = await import("@/lib/queries/field-orders");

  await db.execute(sql`truncate table shipping_rates, pin_locations, stock_holds, field_unfilled_orders, sales restart identity cascade`);
  const rate = (slab: string, min: number, max: number, zone: string, fee: number, d: { pincodes?: string; districts?: string; states?: string } = {}) => ({
    slab, minWeightGrams: min, maxWeightGrams: max, zoneName: zone, regions: zone, transitDays: "3 - 5 Days", shippingFee: fee.toFixed(2),
    pincodes: d.pincodes ?? "", districts: d.districts ?? "", states: d.states ?? "", isActive: true,
  });
  await db.insert(shippingRates).values([
    rate("0-500g", 0, 500, "Chennai", 67, { pincodes: "600016,600043" }),
    rate("500g-1kg", 501, 1000, "Chennai", 85, { pincodes: "600016,600043" }),
    rate("500g-1kg", 501, 1000, "Kerala", 50, { states: "kerala" }),
    rate("1-2kg", 1001, 2000, "Chennai district", 40, { districts: "chennai" }),
    rate("0-500g", 0, 500, "Rest of India", 111),
    rate("500g-1kg", 501, 1000, "Rest of India", 159),
  ]);
  // Saved PIN lookups (the live server fills these from Delhivery).
  await db.insert(pinLocations).values([
    { pin: "600016", district: "Chennai", state: "TN" },
    { pin: "682001", district: "Ernakulam", state: "KL" },
    { pin: "110001", district: "New Delhi", state: "DL" },
  ]);

  const q = async (pin: string, g: number) => (await calculateManualShippingRate(pin, g)).amount;
  assert.equal(await q("600016", 400), 67);
  assert.equal(await q("600016", 900), 85);
  assert.equal(await q("600016", 1500), 40, "Chennai 1-2 kg (district rule) — spec example");
  assert.equal(await q("682001", 800), 50, "Kerala 500g-1kg — spec example");
  assert.equal(await q("110001", 300), 111);
  console.log("  ✓ quotes: PIN, district, state and default rules by weight band");

  const [fert] = await db.insert(products).values({ name: `Fertiliser ${Date.now()}`, sku: `F-${Date.now()}`, hsnCode: "31010099", saleRate: "100.00", purchaseRate: "80.00", gstRate: "5.00", stockQty: "10.00" } as typeof products.$inferInsert).returning({ id: products.id });
  const [mach] = await db.insert(products).values({ name: `Sprayer ${Date.now()}`, sku: `M-${Date.now()}`, hsnCode: "84242000", saleRate: "1000.00", purchaseRate: "800.00", gstRate: "18.00", stockQty: "10.00" } as typeof products.$inferInsert).returning({ id: products.id });
  await db.insert(productBatches).values([
    { productId: fert!.id, batchNumber: "F1", qty: "10.00" },
    { productId: mach!.id, batchNumber: "M1", qty: "10.00" },
  ]);

  const order = await placeFieldOrder({
    orderId: "SW-SHIP-1",
    farmerName: "Test farmer",
    farmerPhone: "9000000001",
    officerName: "Farmer",
    paidAmount: 0,
    items: [
      { productId: fert!.id, batchId: null, qty: 2, rate: 100, gstRate: 5 },
      { productId: mach!.id, batchId: null, qty: 1, rate: 1000, gstRate: 18 },
    ],
    shippingAmount: 85,
  });
  const lines = await db.select().from(saleItems).where(eq(saleItems.saleId, order.saleId));
  const ship = lines.filter((l) => !l.productId);
  assert.equal(ship.length, 2, "one delivery line per GST rate");
  assert.deepEqual(ship.map((l) => Number(l.gstRate)).sort((a, b) => a - b), [5, 18]);
  assert.ok(ship.every((l) => l.hsnCode === "996812"));
  const [sale] = await db.select().from(sales).where(eq(sales.id, order.saleId));
  const goods = 2 * 100 * 1.05 + 1000 * 1.18;
  const total = Number(sale!.grandTotal);
  assert.ok(Math.abs(total - (goods + 85)) <= 1, `invoice total ${total} should be goods ${goods} + delivery 85`);
  console.log(`  ✓ invoice: goods ₹${goods} + delivery ₹85 = ₹${total}; delivery split at 5% and 18% GST, SAC 996812`);
  for (const l of ship) console.log(`      ${l.customName ?? "Delivery"}: ₹${l.rate} + ${l.gstRate}% GST`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
