import Link from "next/link";
import { getCurrentUser } from "@/lib/actions/auth";
import {
  getOpenCustomerCreditInvoices,
  type OpenCreditInvoice,
} from "@/lib/queries/payments";
import { formatCurrency, formatDateIST, toNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CreditGroup = {
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  due: number;
  invoices: OpenCreditInvoice[];
};

function groupByCustomer(rows: OpenCreditInvoice[]): CreditGroup[] {
  const groups: CreditGroup[] = [];
  const index = new Map<number, CreditGroup>();
  for (const row of rows) {
    let group = index.get(row.customerId);
    if (!group) {
      group = {
        customerId: row.customerId,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        due: 0,
        invoices: [],
      };
      index.set(row.customerId, group);
      groups.push(group);
    }
    group.invoices.push(row);
    group.due = Math.round((group.due + toNumber(row.balance)) * 100) / 100;
  }
  return groups;
}

export default async function CustomerCreditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  const canCollect = user?.role !== "dealer";
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const rows = await getOpenCustomerCreditInvoices(q);
  const groups = groupByCustomer(rows);
  const totalDue = groups.reduce((sum, g) => sum + g.due, 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Credit</h1>
        <p className="text-sm text-slate-500">
          Customer balances by invoice — collect the remaining amount later on
          Receipts.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <form className="flex max-w-md flex-1 gap-2" action="/accounts/credit">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search customer, phone, or invoice…"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total due
          </p>
          <p className="text-2xl font-bold text-amber-700">
            {formatCurrency(totalDue)}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-slate-400">
            {q
              ? "No matching credit invoices."
              : "No customer credit outstanding."}
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.customerId}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-base">
                  {canCollect ? (
                    <Link
                      href={`/customers/${group.customerId}`}
                      className="text-emerald-800 hover:underline"
                    >
                      {group.customerName}
                    </Link>
                  ) : (
                    group.customerName
                  )}
                </CardTitle>
                {group.customerPhone ? (
                  <p className="mt-1 text-sm text-slate-500">
                    {group.customerPhone}
                  </p>
                ) : null}
              </div>
              <p className="text-lg font-semibold text-amber-700">
                {formatCurrency(group.due)}
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Bill</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    {canCollect ? (
                      <TableHead className="text-right">Collect</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.invoices.map((invoice) => (
                    <TableRow key={invoice.saleId}>
                      <TableCell>
                        <Link
                          href={`/invoices/${invoice.saleId}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {invoice.invoiceNo}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDateIST(invoice.date)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(invoice.grandTotal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(invoice.paidAmount ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(invoice.balance)}
                      </TableCell>
                      {canCollect ? (
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link
                              href={`/accounts/receipts?customer=${group.customerId}&sale=${invoice.saleId}`}
                            >
                              Collect
                            </Link>
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
