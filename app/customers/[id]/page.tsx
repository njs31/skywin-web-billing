import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCustomerById,
  getCustomerOutstanding,
  getCustomerSales,
} from "@/lib/queries/customers";
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

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customerId = parseInt(id, 10);
  const customer = await getCustomerById(customerId);
  if (!customer) notFound();

  const [outstanding, sales] = await Promise.all([
    getCustomerOutstanding(customerId),
    getCustomerSales(customerId),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-sm capitalize text-slate-500">
            {customer.type} customer
            {customer.phone && ` · ${customer.phone}`}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/customers">Back</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Outstanding</p>
            <p className="text-2xl font-bold text-amber-600">
              {formatCurrency(outstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Credit Limit</p>
            <p className="text-2xl font-bold">
              {formatCurrency(customer.creditLimit ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Total Bills</p>
            <p className="text-2xl font-bold">{sales.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales History</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <p className="text-sm text-slate-400">No sales yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/invoices/${s.id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        {s.invoiceNo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {new Date(s.date).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell className="capitalize">{s.paymentMode}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(s.grandTotal)}
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
