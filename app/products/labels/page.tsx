import Link from "next/link";
import { db } from "@/db";
import { products } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { ProductLabelSheet } from "@/components/products/product-label-sheet";
import { presentDotsFromMm } from "@/lib/escpos-print";
import { getSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";

export default async function ProductLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const idList = (ids || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 200);

  const rows =
    idList.length === 0
      ? []
      : await db
          .select({
            id: products.id,
            name: products.name,
            barcode: products.barcode,
            sku: products.sku,
            saleRate: products.saleRate,
            gstRate: products.gstRate,
            expiryDate: products.expiryDate,
          })
          .from(products)
          .where(inArray(products.id, idList));

  // How far to feed so the last label clears the tear bar. A property of the
  // printer, so the shop can tune it without a deploy.
  const settings = await getSettings();
  const presentDots = presentDotsFromMm(settings.labelTearOffMm);

  return (
    <div className="label-print-page">
      <div className="no-print border-b bg-slate-50 px-4 py-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/products">Back to Products</Link>
        </Button>
      </div>
      <ProductLabelSheet products={rows} presentDots={presentDots} />
    </div>
  );
}
