import { getReceipts } from "@/lib/queries/payments";
import { getCustomers } from "@/lib/queries/customers";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReceiptForm } from "@/components/accounts/receipt-form";

export default async function ReceiptsPage() {
  const [receipts, customers] = await Promise.all([
    getReceipts(),
    getCustomers(),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Receipts</h1>
        <p className="text-sm text-slate-500">
          Collect payments from customers against outstanding
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceiptForm customers={customers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {receipts.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">No receipts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {new Date(r.date).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell className="capitalize">{r.paymentMode}</TableCell>
                    <TableCell>{r.referenceNo ?? "-"}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">
                      {formatCurrency(r.amount)}
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
