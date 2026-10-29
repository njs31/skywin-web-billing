import Link from "next/link";
import { getPurchases } from "@/lib/queries/purchases";
import { formatCurrency } from "@/lib/utils";
import { PurchaseReport } from "@/components/purchases/purchase-report";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/actions/auth";
import { matrixAllows } from "@/lib/user-roles";
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
  const [purchases, user] = await Promise.all([getPurchases(), getCurrentUser()]);
  const canEnterPurchase = matrixAllows(user?.role, "purchase_entry", "create");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchases</h1>
          <p className="text-sm text-slate-500">Stock inward from suppliers</p>
        </div>
        {canEnterPurchase ? (
          <Button asChild>
            <Link href="/purchases/new">New Purchase</Link>
          </Button>
        ) : null}
      </div>

      <PurchaseReport />

      <Card>
        <CardContent className="p-0">
          {purchases.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No purchases yet.
              {canEnterPurchase ? (
                <>
                  {" "}
                  <Link href="/purchases/new" className="text-emerald-600 underline">
                    Record your first purchase
                  </Link>
                </>
              ) : null}
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
                  <TableHead className="text-right">Action</TableHead>
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/purchases/${p.id}`}>Show</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/purchases/${p.id}/edit`}>Edit</Link>
                        </Button>
                        <Button asChild size="sm">
                          <Link href={`/purchases/${p.id}?print=1`}>Print</Link>
                        </Button>
                      </div>
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
