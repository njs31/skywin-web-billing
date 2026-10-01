import Link from "next/link";
import { getSalesFiltered, parseSaleListParams } from "@/lib/queries/sales";
import { getCurrentUser } from "@/lib/actions/auth";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
import { SalesReport } from "@/components/invoices/sales-report";
import { InvoiceFilters } from "@/components/invoices/invoice-filters";
import { InvoiceSortBar } from "@/components/invoices/invoice-sort-bar";
import { PrintSizeMenu } from "@/components/invoice/print-size-menu";
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

const BILL_TYPE_STYLES: Record<string, string> = {
  retail: "bg-slate-100 text-slate-700 ring-slate-200",
  wholesale: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  others: "bg-amber-100 text-amber-800 ring-amber-200",
};

function BillTypeBadge({ billType }: { billType: string }) {
  const key = (billType || "retail").toLowerCase();
  const style = BILL_TYPE_STYLES[key] ?? BILL_TYPE_STYLES.retail;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${style}`}
    >
      {key}
    </span>
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; day?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const filter = parseSaleListParams(params);
  const [sales, currentUser] = await Promise.all([
    getSalesFiltered(filter),
    getCurrentUser(),
  ]);
  const isAdmin = currentUser?.role === "admin";
  const filtered =
    filter.q !== "" ||
    filter.billType !== "all" ||
    filter.day !== null ||
    filter.sort !== "newest";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-slate-500">
            Sales history, GST invoices, and date-range sales report
          </p>
        </div>
        <Button asChild>
          <Link href="/pos">New Sale</Link>
        </Button>
      </div>

      <SalesReport />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find invoices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InvoiceFilters
            key={filter.q}
            defaultQuery={filter.q}
            defaultDay={filter.day ?? ""}
            type={filter.billType}
            sort={filter.sort}
          />
          <InvoiceSortBar
            q={filter.q}
            type={filter.billType}
            day={filter.day ?? ""}
            sort={filter.sort}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered
              ? `${sales.length} matching invoice${sales.length === 1 ? "" : "s"}`
              : "Recent Invoices"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sales.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              {filtered
                ? "No invoices match these filters."
                : "No invoices yet. Create a sale from POS."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => {
                  const paid = Number(sale.paidAmount ?? 0);
                  const total = Number(sale.grandTotal ?? 0);
                  const cancelled = sale.status === "cancelled";
                  const status = cancelled
                    ? "Cancelled"
                    : sale.paymentMode === "credit" && paid < total - 0.01
                      ? paid > 0
                        ? "Partial"
                        : "Pending"
                      : "Paid";
                  return (
                  <TableRow key={sale.id} className={cancelled ? "opacity-60" : undefined}>
                    <TableCell className={`font-medium ${cancelled ? "line-through" : ""}`}>
                      {sale.invoiceNo}
                    </TableCell>
                    <TableCell>
                      <BillTypeBadge billType={sale.billType} />
                    </TableCell>
                    <TableCell>{formatDateTimeIST(sale.date)}</TableCell>
                    <TableCell>{sale.customerName ?? "-"}</TableCell>
                    <TableCell className="capitalize">{sale.paymentMode}</TableCell>
                    <TableCell
                      className={
                        cancelled
                          ? "font-medium text-red-600"
                          : status === "Paid"
                            ? "font-medium text-emerald-700"
                            : "font-medium text-amber-600"
                      }
                    >
                      {status}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(sale.grandTotal)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/invoices/${sale.id}`}>View</Link>
                        </Button>
                        {isAdmin && !cancelled && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/invoices/${sale.id}/edit`}>Edit</Link>
                          </Button>
                        )}
                        <PrintSizeMenu href={`/invoices/${sale.id}`} />
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
