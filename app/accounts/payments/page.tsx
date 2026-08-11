import Link from "next/link";
import { getSupplierPayments } from "@/lib/queries/payments";
import { getAllSuppliers } from "@/lib/queries/suppliers";
import { formatCurrency } from "@/lib/utils";
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
import { PaymentForm } from "@/components/accounts/payment-form";
import { PrintSizeMenu } from "@/components/invoice/print-size-menu";

export default async function PaymentsPage() {
  const [payments, suppliers] = await Promise.all([
    getSupplierPayments(),
    getAllSuppliers(),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier Payments</h1>
        <p className="text-sm text-slate-500">
          Pay suppliers against purchase outstanding
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record Payment</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentForm suppliers={suppliers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">No payments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Against Bills</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {new Date(p.date).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>{p.supplierName}</TableCell>
                    <TableCell className="capitalize">{p.paymentMode}</TableCell>
                    <TableCell>{p.referenceNo ?? "-"}</TableCell>
                    <TableCell className="max-w-xs text-xs text-slate-600">
                      {p.allocatedInvoices || "-"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(p.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/accounts/payments/${p.id}`}>View</Link>
                        </Button>
                        <PrintSizeMenu href={`/accounts/payments/${p.id}`} />
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
