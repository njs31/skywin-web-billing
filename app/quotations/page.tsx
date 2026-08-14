import Link from "next/link";
import { getQuotations } from "@/lib/queries/quotations";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
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

export default async function QuotationsPage() {
  const quotes = await getQuotations();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quotations</h1>
          <p className="text-sm text-slate-500">
            Customer quotations with unique numbers for sales invoices
          </p>
        </div>
        <Button asChild>
          <Link href="/quotations/new">New Quotation</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Quotations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quotes.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              No quotations yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.quotationNo}</TableCell>
                    <TableCell>{formatDateTimeIST(q.date)}</TableCell>
                    <TableCell>
                      {q.customerRecordName ?? q.customerName ?? "-"}
                    </TableCell>
                    <TableCell className="capitalize">{q.status}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(q.grandTotal)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/quotations/${q.id}`}>View</Link>
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
