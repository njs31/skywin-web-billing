"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
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
import { InvoicesPagination } from "@/components/invoices/invoices-pagination";
import type { SaleListFilter } from "@/lib/queries/sales";

const BULK_CAP = 50;

export type BulkInvoiceRow = {
  id: number;
  invoiceNo: string;
  date: Date | string;
  billType: string;
  customerName: string | null;
  paymentMode: string;
  grandTotal: string;
  paidAmount: string | null;
  status: string;
};

function statusTone(cancelled: boolean, status: string): string {
  if (cancelled) return "bg-red-500";
  if (status === "Paid") return "bg-emerald-500";
  return "bg-amber-500";
}

function paperGroup(billType: string) {
  return billType === "retail" ? "receipt" : "a4";
}

export function InvoiceBulkList({
  sales,
  isAdmin,
  filter,
  page,
  pageSize,
  total,
}: {
  sales: BulkInvoiceRow[];
  isAdmin: boolean;
  filter: Omit<SaleListFilter, "page" | "pageSize">;
  page: number;
  pageSize: number;
  total: number;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const idSet = useMemo(() => new Set(sales.map((s) => s.id)), [sales]);
  const pageSelected = sales.filter((s) => selected.includes(s.id));
  const allOnPage = sales.length > 0 && sales.every((s) => selected.includes(s.id));
  const receiptIds = pageSelected
    .filter((s) => paperGroup(s.billType) === "receipt")
    .map((s) => s.id);
  const a4Ids = pageSelected
    .filter((s) => paperGroup(s.billType) === "a4")
    .map((s) => s.id);

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-BULK_CAP)
    );
  };

  const toggleAll = () => {
    if (allOnPage) {
      setSelected((prev) => prev.filter((id) => !idSet.has(id)));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const sale of sales) next.add(sale.id);
      return Array.from(next).slice(-BULK_CAP);
    });
  };

  const hrefFor = (ids: number[], size?: string) => {
    const params = new URLSearchParams();
    params.set("ids", ids.join(","));
    if (size) params.set("size", size);
    return `/invoices/bulk-print?${params.toString()}`;
  };

  return (
    <>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-emerald-50 px-4 py-2 text-sm">
          <span className="font-medium text-slate-700">
            {selected.length} selected
            {selected.length >= BULK_CAP ? ` (max ${BULK_CAP})` : ""}
          </span>
          {receiptIds.length > 0 && (
            <Button asChild size="sm">
              <Link href={hrefFor(receiptIds, "RECEIPT")} target="_blank">
                Print {receiptIds.length} retail (80mm)
              </Link>
            </Button>
          )}
          {a4Ids.length > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link href={hrefFor(a4Ids)} target="_blank">
                Print {a4Ids.length} A4
              </Link>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}
      <Table className="[&_td]:py-2.5 [&_th]:h-9">
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Select all invoices on this page"
                checked={allOnPage}
                onChange={toggleAll}
              />
            </TableHead>
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
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select ${sale.invoiceNo}`}
                    checked={selected.includes(sale.id)}
                    onChange={() => toggle(sale.id)}
                  />
                </TableCell>
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
        filter={filter}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
