import Link from "next/link";
import { getCustomersWithOutstanding, getCustomers } from "@/lib/queries/customers";
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
import { CustomerForm } from "@/components/customers/customer-form";

export default async function CustomersPage() {
  const [customers, outstanding] = await Promise.all([
    getCustomers(),
    getCustomersWithOutstanding(),
  ]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-slate-500">
            {customers.length} parties — farmers, retail & wholesale buyers
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Add Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerForm />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Outstanding Receivables</CardTitle>
          </CardHeader>
          <CardContent>
            {outstanding.length === 0 ? (
              <p className="text-sm text-slate-400">No outstanding balances.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstanding.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell>{c.phone ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold text-amber-600">
                        {formatCurrency(c.outstanding)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Customers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead className="text-right">Credit Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{c.type}</TableCell>
                  <TableCell>{c.phone ?? "-"}</TableCell>
                  <TableCell className="text-xs">{c.gstin ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(c.creditLimit ?? 0)}
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
