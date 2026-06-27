import Link from "next/link";
import { getSales } from "@/lib/queries/sales";
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

export default async function InvoicesPage() {
  const sales = await getSales();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-slate-500">Sales history and GST invoices</p>
        </div>
        <Button asChild>
          <Link href="/pos">New Sale</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No invoices yet. Create a sale from POS.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">{sale.invoiceNo}</TableCell>
                    <TableCell>
                      {new Date(sale.date).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell>{sale.customerName ?? "-"}</TableCell>
                    <TableCell className="capitalize">{sale.paymentMode}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(sale.grandTotal)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/invoices/${sale.id}`}>View</Link>
                      </Button>
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
