import { db } from "@/db";
import { sales, products, productBatches } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      paymentMode: sales.paymentMode,
      grandTotal: sales.grandTotal,
      paidAmount: sales.paidAmount,
      cashAmount: sales.cashAmount,
      upiAmount: sales.upiAmount,
    })
    .from(sales)
    .orderBy(desc(sales.id))
    .limit(20);
  console.log("=== Recent sales ===");
  console.log(JSON.stringify(rows, null, 2));

  const mismatch = await db.execute(sql`
    select id, invoice_no, payment_mode, grand_total, paid_amount, cash_amount, upi_amount
    from sales
    where payment_mode = 'upi'
      and coalesce(paid_amount::numeric, 0) < grand_total::numeric - 0.01
    order by id desc
    limit 10
  `);
  console.log("=== UPI underpaid ===");
  console.log(mismatch);

  const sample = await db
    .select({
      id: products.id,
      name: products.name,
      saleRate: products.saleRate,
      mrp: products.mrp,
      batchId: productBatches.id,
      batchSale: productBatches.saleRate,
    })
    .from(products)
    .leftJoin(productBatches, eq(productBatches.productId, products.id))
    .where(sql`${productBatches.saleRate} is not null and ${productBatches.saleRate}::numeric <> ${products.saleRate}::numeric`)
    .limit(10);
  console.log("=== Product vs batch rate mismatches ===");
  console.log(JSON.stringify(sample, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
