import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchaseById } from "@/lib/queries/purchases";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const purchase = await getPurchaseById(parseInt(id, 10));
  if (!purchase) notFound();

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Purchase {purchase.invoiceNo ?? `#${purchase.id}`}
          </h1>
          <p className="text-sm text-slate-500">
            {purchase.supplierName} ·{" "}
            {new Date(purchase.date).toLocaleDateString("en-IN")} ·{" "}
            <span className="capitalize">{purchase.paymentType}</span>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/purchases">Back</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">Subtotal</p>
            <p className="text-xl font-semibold">
              {formatCurrency(purchase.subtotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">GST Total</p>
            <p className="text-xl font-semibold">
              {formatCurrency(purchase.gstTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-slate-500">Grand Total</p>
            <p className="text-xl font-semibold text-emerald-700">
              {formatCurrency(purchase.grandTotal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {purchase.notes && (
        <Card>
          <CardContent className="p-4 text-sm text-slate-600">
            Notes: {purchase.notes}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell className="font-medium">
                    {item.productName ?? item.customName ?? "Item"}
                  </TableCell>
                  <TableCell>{item.hsnCode ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(item.qty, 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.rate)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(item.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
