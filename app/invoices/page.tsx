import Link from "next/link";
import { redirect } from "next/navigation";
import { getSalesFiltered, parseSaleListParams } from "@/lib/queries/sales";
import { getCurrentUser } from "@/lib/actions/auth";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
import { SalesReport } from "@/components/invoices/sales-report";
import { InvoiceToolbar } from "@/components/invoices/invoice-toolbar";
import { InvoicesPagination } from "@/components/invoices/invoices-pagination";
import { PrintSizeMenu } from "@/components/invoice/print-size-menu";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusTone(cancelled: boolean, status: string): string {
  if (cancelled) return "bg-red-500";
  if (status === "Paid") return "bg-emerald-500";
  return "bg-amber-500";
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    day?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const params = await searchParams;
  const filter = parseSaleListParams(params);
  const [{ rows: sales, total }, currentUser] = await Promise.all([
    getSalesFiltered(filter),
    getCurrentUser(),
  ]);
  const isAdmin = currentUser?.role === "admin";
  const totalPages = Math.max(1, Math.ceil(total / filter.pageSize));

  // A stale/bookmarked page past the end re-resolves to the last page
  // instead of rendering an empty table.
  if (total > 0 && filter.page > totalPages) {
    const query = new URLSearchParams();
    if (filter.q) query.set("q", filter.q);
    if (filter.billType !== "all") query.set("type", filter.billType);
    if (filter.day) query.set("day", filter.day);
    if (filter.sort !== "newest") query.set("sort", filter.sort);
    query.set("page", String(totalPages));
    if (filter.pageSize !== 20) query.set("pageSize", String(filter.pageSize));
    redirect(`/invoices?${query.toString()}`);
  }

  const filtered =
    filter.q !== "" ||
    filter.billType !== "all" ||
    filter.day !== null ||
    filter.sort !== "newest";

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-slate-500">
            Manage sales invoices, payments, and reports.
          </p>
        </div>
        <Button asChild>
          <Link href="/pos">+ New Sale</Link>
        </Button>
      </div>

      <SalesReport />

      <section
        aria-label="Invoices"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Invoices</h2>
            <p className="text-sm text-slate-500" aria-live="polite">
              {total.toLocaleString("en-IN")}{" "}
              {total === 1 ? "invoice" : "invoices"}
              {filtered ? " match" : " total"}
            </p>
          </div>
          <InvoiceToolbar
            key={`${filter.q}-${filter.billType}-${filter.day ?? ""}-${filter.sort}`}
            defaultQuery={filter.q}
            defaultType={filter.billType}
            defaultDay={filter.day ?? ""}
            defaultSort={filter.sort}
            pageSize={filter.pageSize}
          />
        </div>

        {sales.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-medium text-slate-700">
              {filtered ? "No invoices found" : "No invoices yet"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {filtered ? (
                <>
                  Try changing your search or{" "}
                  <Link href="/invoices" className="text-emerald-700 hover:underline">
                    clear all filters
                  </Link>
                  .
                </>
              ) : (
                "Create your first sale to get started."
              )}
            </p>
            {!filtered && (
              <Button asChild className="mt-4">
                <Link href="/pos">+ New Sale</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <Table className="[&_td]:py-2.5 [&_th]:h-9">
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => {
                  const paid = Number(sale.paidAmount ?? 0);
                  const grand = Number(sale.grandTotal ?? 0);
                  const cancelled = sale.status === "cancelled";
                  const status = cancelled
                    ? "Cancelled"
                    : sale.paymentMode === "credit" && paid < grand - 0.01
                      ? paid > 0
                        ? "Partial"
                        : "Pending"
                      : "Paid";
                  return (
                    <TableRow
                      key={sale.id}
                      className={cancelled ? "opacity-60" : undefined}
                    >
                      <TableCell
                        className={`whitespace-nowrap text-sm font-medium ${cancelled ? "line-through" : ""}`}
                      >
                        {sale.invoiceNo}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs capitalize text-slate-500">
                        {sale.billType}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[13px] text-slate-600">
                        {formatDateTimeIST(sale.date)}
                      </TableCell>
                      <TableCell className="max-w-44 truncate text-sm">
                        {sale.customerName ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm capitalize text-slate-600">
                        {sale.paymentMode}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${
                            cancelled
                              ? "text-red-600"
                              : status === "Paid"
                                ? "text-emerald-700"
                                : "text-amber-700"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full ${statusTone(cancelled, status)}`}
                          />
                          {status}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                        {formatCurrency(sale.grandTotal)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/invoices/${sale.id}`}>View</Link>
                          </Button>
                          {isAdmin && !cancelled && (
                            <Button asChild size="sm" variant="ghost">
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
            <InvoicesPagination
              filter={{
                q: filter.q,
                billType: filter.billType,
                day: filter.day,
                sort: filter.sort,
              }}
              page={filter.page}
              pageSize={filter.pageSize}
              total={total}
            />
          </>
        )}
      </section>
    </div>
  );
}
