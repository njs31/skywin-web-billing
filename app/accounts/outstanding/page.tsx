import { getCustomersWithOutstanding } from "@/lib/queries/customers";
import {
  getSuppliersWithOutstanding,
  getOutstandingSummary,
} from "@/lib/queries/payments";
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

export default async function OutstandingPage() {
  const [summary, customers, suppliers] = await Promise.all([
    getOutstandingSummary(),
    getCustomersWithOutstanding(),
    getSuppliersWithOutstanding(),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Outstanding</h1>
        <p className="text-sm text-slate-500">
          Receivables from customers and payables to suppliers
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Total Receivable</p>
            <p className="text-3xl font-bold text-emerald-700">
              {formatCurrency(summary.receivables)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Total Payable</p>
            <p className="text-3xl font-bold text-red-600">
              {formatCurrency(summary.payables)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Debtors (Customers)</CardTitle>
          </CardHeader>
          <CardContent>
            {customers.length === 0 ? (
              <p className="text-sm text-slate-400">No receivables.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(c.outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Creditors (Suppliers)</CardTitle>
          </CardHeader>
          <CardContent>
            {suppliers.length === 0 ? (
              <p className="text-sm text-slate-400">No payables.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(s.outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
