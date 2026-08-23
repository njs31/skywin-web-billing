"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Search } from "lucide-react";
import { getPurchaseReportData } from "@/lib/actions/purchases";
import type { PurchaseReportData } from "@/lib/queries/purchases";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultToDate() {
  return toDateInputValue(new Date());
}

function defaultFromDate() {
  const now = new Date();
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return toDateInputValue(date);
}

const QUICK_RANGES = [
  { label: "Last 1 Week", days: 7 },
  { label: "Last 10 Days", days: 10 },
  { label: "Last 15 Days", days: 15 },
  { label: "Last 30 Days", days: 30 },
] as const;

export function PurchaseReport() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [data, setData] = useState<PurchaseReportData | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const generate = (from = fromDate, to = toDate) => {
    setError("");
    startTransition(async () => {
      try {
        const report = await getPurchaseReportData(from, to);
        setData(report);
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load report");
      }
    });
  };

  const downloadExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const billRows = data.bills.map((b, i) => ({
      "S.No.": i + 1,
      Invoice: b.invoiceNo,
      Date: formatDateTimeIST(b.date),
      Supplier: b.supplierName,
      Payment: b.paymentType,
      Subtotal: b.subtotal,
      GST: b.gstTotal,
      Handling: b.handlingCharges,
      "Grand Total": b.grandTotal,
      Paid: b.paidAmount,
    }));
    billRows.push({
      "S.No.": "" as unknown as number,
      Invoice: "GRAND TOTAL",
      Date: "",
      Supplier: "",
      Payment: "",
      Subtotal: data.summary.subtotal,
      GST: data.summary.gstTotal,
      Handling: data.summary.handlingCharges,
      "Grand Total": data.summary.grandTotal,
      Paid: data.summary.paidAmount,
    });
    const lineRows = data.lineItems.map((item, i) => ({
      "S.No.": i + 1,
      Invoice: item.invoiceNo,
      Date: formatDateTimeIST(item.date),
      Supplier: item.supplierName,
      Payment: item.paymentType,
      Product: item.productName,
      HSN: item.hsnCode,
      Batch: item.batchNumber,
      Qty: item.qty,
      Rate: item.rate,
      Amount: item.amount,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(billRows),
      "Purchases"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(lineRows),
      "Line Items"
    );
    XLSX.writeFile(
      wb,
      `Skywin-Purchase-Report-${data.fromDate}-to-${data.toDate}.xlsx`
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Purchase Report</CardTitle>
        <p className="text-xs text-slate-500">
          Date range Excel export (same style as sales report)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              className="h-9 w-40"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              className="h-9 w-40"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => generate()}
            className="gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            {isPending ? "Loading…" : "Generate Report"}
          </Button>
          {data && (
            <Button
              size="sm"
              variant="outline"
              onClick={downloadExcel}
              className="gap-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_RANGES.map((r) => (
            <Button
              key={r.days}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                const from = daysAgo(r.days);
                const to = defaultToDate();
                setFromDate(from);
                setToDate(to);
                generate(from, to);
              }}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {data && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Bills</p>
                <p className="text-lg font-semibold">{data.summary.billCount}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Subtotal</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(data.summary.subtotal)}
                </p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Handling</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(data.summary.handlingCharges)}
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Grand Total</p>
                <p className="text-lg font-semibold text-emerald-800">
                  {formatCurrency(data.summary.grandTotal)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bills.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-sm text-slate-400"
                      >
                        No purchases in this range
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.bills.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateTimeIST(b.date)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {b.invoiceNo}
                        </TableCell>
                        <TableCell>{b.supplierName}</TableCell>
                        <TableCell className="capitalize">
                          {b.paymentType}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(b.grandTotal)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {data.bills.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="font-semibold">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(data.summary.grandTotal)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
