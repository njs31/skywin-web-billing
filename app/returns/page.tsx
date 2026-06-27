import Link from "next/link";
import { getSaleReturns } from "@/lib/queries/returns";
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
import { ReturnForm } from "@/components/returns/return-form";
import { getCustomers } from "@/lib/queries/customers";

export default async function ReturnsPage() {
  const [returns, customers] = await Promise.all([
    getSaleReturns(),
    getCustomers(),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Returns</h1>
          <p className="text-sm text-slate-500">
            Credit notes and stock restoration
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/invoices">View Invoices</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Return</CardTitle>
        </CardHeader>
        <CardContent>
          <ReturnForm customers={customers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Return History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">No returns recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Original Invoice</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.returnNo}</TableCell>
                    <TableCell>
                      {new Date(r.date).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>{r.saleInvoiceNo ?? "-"}</TableCell>
                    <TableCell>{r.reason ?? "-"}</TableCell>
                    <TableCell className="text-right font-semibold text-red-600">
                      {formatCurrency(r.grandTotal)}
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
