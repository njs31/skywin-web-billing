import Link from "next/link";
import { getPurchases } from "@/lib/actions/purchases";
import { formatCurrency } from "@/lib/utils";
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

export default async function PurchasesPage() {
  const purchases = await getPurchases();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchases</h1>
          <p className="text-sm text-slate-500">Stock inward from suppliers</p>
        </div>
        <Button asChild>
          <Link href="/purchases/new">New Purchase</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {purchases.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No purchases yet.{" "}
              <Link href="/purchases/new" className="text-emerald-600 underline">
                Record your first purchase
              </Link>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {new Date(p.date).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell className="font-medium">{p.supplierName}</TableCell>
                    <TableCell>{p.invoiceNo ?? "-"}</TableCell>
                    <TableCell className="capitalize">{p.paymentType}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(p.grandTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
