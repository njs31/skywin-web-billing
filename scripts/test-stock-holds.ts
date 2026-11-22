/**
 * End-to-end test of stock holds against a THROWAWAY local database (never the live one).
 *
 *   DATABASE_URL=postgres://test@127.0.0.1:55432/skywin npx tsx scripts/test-stock-holds.ts
 *
 * Covers: the counter cannot sell held stock, a second app customer cannot hold it, the paying
 * order bills against its own hold, many checkouts and counter sales racing for the last unit
 * sell it exactly once, expired holds stop blocking, and the app save racing the webhook bills once.
 */
import Module from "node:module";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";

// Outside Next.js: settings are read straight from the database, no page cache.
const originalLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "next/cache") {
    return { revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: (fn: Function) => fn };
  }
  return originalLoad(request, parent, isMain);
};

const url = process.env.DATABASE_URL || "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("Refusing to run: DATABASE_URL must point at a local test database.");
  process.exit(1);
}

async function main() {
  const { db } = await import("@/db");
  const { products, productBatches, stockHolds, sales } = await import("@/db/schema");
  const { createSale } = await import("@/lib/queries/sales");
  const { placeStockHolds } = await import("@/lib/stock-holds");
  const { placeFieldOrder } = await import("@/lib/queries/field-orders");

  // Throwaway database: start every run from empty sales and holds.
  await db.execute(sql`truncate table stock_holds, field_unfilled_orders, sales restart identity cascade`);

  let seq = 0;
  async function product(units: Array<[string, number]>) {
    seq += 1;
    const total = units.reduce((s, [, q]) => s + q, 0);
    const [p] = await db
      .insert(products)
      .values({
        name: `Hold test ${seq} ${Date.now()}`,
        sku: `HT-${seq}-${Date.now()}`,
        hsnCode: "38089199",
        saleRate: "100.00",
        purchaseRate: "80.00",
        gstRate: "18.00",
        stockQty: total.toFixed(2),
      } as typeof products.$inferInsert)
      .returning({ id: products.id });
    const batchIds: number[] = [];
    for (const [batchNumber, qty] of units) {
      const [b] = await db
        .insert(productBatches)
        .values({ productId: p!.id, batchNumber, qty: qty.toFixed(2) })
        .returning({ id: productBatches.id });
      batchIds.push(b!.id);
    }
    return { id: p!.id, batchIds };
  }
  const stockOf = async (productId: number) =>
    Number((await db.select({ q: products.stockQty }).from(products).where(eq(products.id, productId)))[0]!.q);

  const counterSale = (productId: number, qty = 1) =>
    createSale({
      billType: "retail",
      paymentMode: "cash",
      operatorName: "Counter",
      items: [{ productId, qty, rate: 100, gstRate: 18, discountType: "percent", discountValue: 0 }],
    });
  const fieldOrder = (orderId: string, productId: number, batchId: number | null, qty = 1) =>
    placeFieldOrder({
      orderId,
      farmerName: "Test farmer",
      farmerPhone: "9000000001",
      officerName: "Farmer",
      paidAmount: 118 * qty,
      items: [{ productId, batchId, qty, rate: 100, gstRate: 18 }],
    });

  let passed = 0;
  const ok = (name: string) => {
    passed += 1;
    console.log(`  ✓ ${name}`);
  };

  // 1. Hold blocks the counter and other customers; the payer bills against it.
  {
    const p = await product([["B1", 1]]);
    const held = await placeStockHolds({ holdKey: "SW-T1", ownerPhone: "9000000001", lines: [{ productId: p.id, batchId: p.batchIds[0]!, qty: 1 }] });
    assert.equal(held.ok, true);
    ok("customer A holds the last unit");

    const other = await placeStockHolds({ holdKey: "SW-T1b", ownerPhone: "9000000002", lines: [{ productId: p.id, batchId: null, qty: 1 }] });
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.shortages[0]!.available, 0);
    ok("customer B is told it is gone, with available = 0");

    await assert.rejects(counterSale(p.id), /out of stock.*held for a SkyWin app payment/);
    ok("the counter cannot sell it and is told it is held for an app payment");

    const sale = await fieldOrder("SW-T1", p.id, p.batchIds[0]!);
    assert.equal(sale.duplicate, false);
    assert.equal(await stockOf(p.id), 0);
    const holds = await db.select().from(stockHolds).where(eq(stockHolds.holdKey, "SW-T1"));
    assert.ok(holds.every((h) => h.status === "consumed"));
    ok("customer A's order bills against the hold; hold marked consumed, stock 0");
  }

  // 2. Retry by the same phone replaces its own hold instead of blocking itself.
  {
    const p = await product([["B1", 1]]);
    assert.equal((await placeStockHolds({ holdKey: "SW-T2a", ownerPhone: "9000000003", lines: [{ productId: p.id, batchId: null, qty: 1 }] })).ok, true);
    assert.equal((await placeStockHolds({ holdKey: "SW-T2b", ownerPhone: "9000000003", lines: [{ productId: p.id, batchId: null, qty: 1 }] })).ok, true);
    ok("a customer retrying payment is not blocked by their own earlier hold");
  }

  // 3. Expired holds stop blocking.
  {
    const p = await product([["B1", 1]]);
    await placeStockHolds({ holdKey: "SW-T3", ownerPhone: "9000000004", lines: [{ productId: p.id, batchId: null, qty: 1 }] });
    await db.update(stockHolds).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(stockHolds.holdKey, "SW-T3"));
    await counterSale(p.id);
    ok("after the hold expires the counter can sell");
    await assert.rejects(fieldOrder("SW-T3", p.id, null), /out of stock|Insufficient/);
    ok("the late payer's order then fails on stock (the app/webhook refunds it)");
  }

  // 4. Race: 12 app checkouts and 6 counter sales for 3 units.
  {
    const p = await product([["B1", 2], ["B2", 1]]);
    const makers = [
      ...Array.from({ length: 12 }, (_, i) => () =>
        placeStockHolds({ holdKey: `SW-R${i}`, ownerPhone: `91000000${String(i).padStart(2, "0")}`, lines: [{ productId: p.id, batchId: null, qty: 1 }] }).then(
          (r) => (r.ok ? "hold" : "short")
        )
      ),
      ...Array.from({ length: 6 }, () => () => counterSale(p.id).then(() => "sold", () => "refused")),
    ];
    // Shuffle so counter sales and app checkouts start in a random order each run.
    for (let i = makers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [makers[i], makers[j]] = [makers[j]!, makers[i]!];
    }
    const results = await Promise.all(makers.map((start) => start()));
    const wins = results.filter((r) => r === "hold" || r === "sold").length;
    const holds = results.filter((r) => r === "hold").length;
    const sold = results.filter((r) => r === "sold").length;
    assert.equal(wins, 3, `expected 3 winners, got ${results.join(",")}`);
    assert.equal(await stockOf(p.id), 3 - sold);
    ok(`18 buyers raced for 3 units: exactly 3 won (${holds} holds, ${sold} counter sales), never oversold`);
  }

  // 4b. Counter sales get a head start; late app checkouts must see the stock as gone.
  {
    const p = await product([["B1", 3]]);
    const counter = Array.from({ length: 5 }, () => counterSale(p.id).then(() => "sold", () => "refused"));
    await new Promise((r) => setTimeout(r, 40));
    const app = Array.from({ length: 8 }, (_, i) =>
      placeStockHolds({ holdKey: `SW-C${i}`, ownerPhone: `92000000${String(i).padStart(2, "0")}`, lines: [{ productId: p.id, batchId: null, qty: 1 }] }).then(
        (r) => (r.ok ? "hold" : "short")
      )
    );
    const results = await Promise.all([...counter, ...app]);
    const sold = results.filter((r) => r === "sold").length;
    const holds = results.filter((r) => r === "hold").length;
    assert.equal(sold + holds, 3, results.join(","));
    assert.equal(await stockOf(p.id), 3 - sold);
    assert.ok(sold > 0, "expected the counter to win some units");
    ok(`counter first: ${sold} counter sales + ${holds} holds = 3, never oversold`);
  }

  // 5. Race: the app save and the webhook bill the same paid order at once.
  {
    const p = await product([["B1", 1]]);
    await placeStockHolds({ holdKey: "SW-T5", ownerPhone: "9000000001", lines: [{ productId: p.id, batchId: null, qty: 1 }] });
    const [a, b] = await Promise.all([fieldOrder("SW-T5", p.id, null), fieldOrder("SW-T5", p.id, null)]);
    assert.equal([a.duplicate, b.duplicate].filter(Boolean).length, 1);
    const count = await db.select({ id: sales.id }).from(sales).where(eq(sales.externalOrderId, "SW-T5"));
    assert.equal(count.length, 1);
    assert.equal(await stockOf(p.id), 0);
    ok("app save + webhook at the same moment: one sale, the other reported as duplicate");
  }

  console.log(`\n${passed} checks passed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
