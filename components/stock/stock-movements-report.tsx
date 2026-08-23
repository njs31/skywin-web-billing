"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Search } from "lucide-react";
import { getStockMovementsReportData } from "@/lib/actions/billing";
import type { StockMovementsReportData } from "@/lib/queries/reports";
import { formatDateTimeIST, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
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

export function StockMovementsReport() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [data, setData] = useState<StockMovementsReportData | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const generate = (from = fromDate, to = toDate) => {
    setError("");
    startTransition(async () => {
      try {
        const report = await getStockMovementsReportData(from, to);
        setData(report);
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load report");
      }
    });
  };

  const downloadExcel = () => {
    if (!data) return;
    const rows = data.rows.map((r, i) => ({
      "S.No.": i + 1,
      Date: formatDateTimeIST(r.date),
      Product: r.productName,
      SKU: r.sku ?? "",
      Type: r.type,
      Qty: r.qtyDelta,
      Batch: r.batchNumber ?? "",
      Reference: r.referenceId ?? "",
      Notes: r.notes ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows),
      "Stock Movements"
    );
    XLSX.writeFile(
      wb,
      `Skywin-Stock-Movements-${data.fromDate}-to-${data.toDate}.xlsx`
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stock Movements Report</CardTitle>
        <p className="text-xs text-slate-500">
          In/out movements for a date range — Excel download
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
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Movements</p>
                <p className="text-lg font-semibold">
                  {data.summary.movementCount}
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Qty In</p>
                <p className="text-lg font-semibold text-emerald-800">
                  {formatNumber(data.summary.qtyIn, 2)}
                </p>
              </div>
              <div className="rounded-lg border bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Qty Out</p>
                <p className="text-lg font-semibold text-amber-800">
                  {formatNumber(data.summary.qtyOut, 2)}
                </p>
              </div>
            </div>

            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-sm text-slate-400"
                      >
                        No stock movements in this range
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateTimeIST(r.date)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.productName}
                        </TableCell>
                        <TableCell className="capitalize">{r.type}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.batchNumber || "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            r.qtyDelta < 0 ? "text-amber-700" : "text-emerald-700"
                          }`}
                        >
                          {formatNumber(r.qtyDelta, 2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
