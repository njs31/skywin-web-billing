import Link from "next/link";
import {
  getStockStatus,
  getStockValuation,
} from "@/lib/queries/reports";
import { db } from "@/db";
import { productBatches } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { formatCurrency, toNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function StockPage() {
  const [stock, valuation] = await Promise.all([
    getStockStatus(),
    getStockValuation(),
  ]);

  const productIds = stock.map((p) => p.id);
  const allBatches =
    productIds.length > 0
      ? await db
          .select()
          .from(productBatches)
          .where(
            inArray(productBatches.productId, productIds)
          )
      : [];

  const batchMap: Record<number, typeof allBatches> = {};
  for (const batch of allBatches) {
    if (toNumber(batch.qty) <= 0) continue;
    (batchMap[batch.productId] ??= []).push(batch);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Status</h1>
          <p className="text-sm text-slate-500">
            Live inventory by product and batch
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/stock/import">Import Excel</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/stock/adjust">Adjust Stock</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Products</p>
            <p className="text-2xl font-bold">{valuation.productCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Total Qty</p>
            <p className="text-2xl font-bold">
              {valuation.totalQty.toLocaleString("en-IN")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Purchase Value</p>
            <p className="text-2xl font-bold">
              {formatCurrency(valuation.purchaseValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Sale Value</p>
            <p className="text-2xl font-bold text-emerald-700">
              {formatCurrency(valuation.saleValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total Stock</TableHead>
                <TableHead>Batches</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead className="text-right">Purchase Rate</TableHead>
                <TableHead className="text-right">Sale Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((p) => {
                const low =
                  toNumber(p.stockQty) < toNumber(p.reorderLevel ?? 10);
                const batches = batchMap[p.id] ?? [];
                return (
                  <TableRow key={p.id} className={low ? "bg-amber-50" : ""}>
                    <TableCell className="max-w-xs font-medium">
                      {p.name}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {p.categoryName ?? "-"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${low ? "text-amber-600" : ""}`}
                    >
                      {toNumber(p.stockQty)}
                    </TableCell>
                    <TableCell className="max-w-md text-xs text-slate-600">
                      {batches.length === 0 ? (
                        <span className="text-slate-400">No batches</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {batches.map((b) => (
                            <li key={b.id}>
                              <span className="font-mono font-medium">
                                {b.batchNumber}
                              </span>
                              {" · "}
                              {toNumber(b.qty)} pcs
                              {b.expiryDate ? ` · exp ${b.expiryDate}` : ""}
                              {b.purchaseRate
                                ? ` · ₹${toNumber(b.purchaseRate)}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {toNumber(p.reorderLevel ?? 10)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(p.purchaseRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(p.saleRate)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
