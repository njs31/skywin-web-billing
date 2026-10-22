"use client";

import { useMemo, useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Search } from "lucide-react";
import { getStockMovementsReportData } from "@/lib/actions/billing";
import type { StockMovementsReportData } from "@/lib/queries/reports";
import { formatDateTimeIST, formatNumber } from "@/lib/utils";
import {
  emptyStockMovementFilter,
  filterStockMovements,
  MOVEMENT_DIRECTIONS,
  MOVEMENT_TYPES,
  summarizeStockMovements,
  type StockMovementFilter,
} from "@/lib/report-filters";
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

const fieldClass =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800";

export function StockMovementsReport() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [filters, setFilters] = useState(emptyStockMovementFilter);
  const [data, setData] = useState<StockMovementsReportData | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(
    () => (data ? filterStockMovements(data.rows, filters) : []),
    [data, filters]
  );
  const summary = useMemo(() => summarizeStockMovements(rows), [rows]);

  const setFilter = <K extends keyof StockMovementFilter>(
    key: K,
    value: StockMovementFilter[K]
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

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
    const sheetRows = rows.map((r, i) => ({
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
      XLSX.utils.json_to_sheet(sheetRows),
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
          In/out movements for a date range. Filters apply to the table and the Excel download.
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
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Product or SKU</Label>
            <Input
              value={filters.q}
              onChange={(event) => setFilter("q", event.target.value)}
              placeholder="Name or SKU"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Movement type</Label>
            <select
              className={fieldClass}
              value={filters.type}
              onChange={(event) =>
                setFilter("type", event.target.value as StockMovementFilter["type"])
              }
            >
              {MOVEMENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All types" : value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Direction</Label>
            <select
              className={fieldClass}
              value={filters.direction}
              onChange={(event) =>
                setFilter(
                  "direction",
                  event.target.value as StockMovementFilter["direction"]
                )
              }
            >
              {MOVEMENT_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "In and out" : value === "in" ? "Stock in" : "Stock out"}
                </option>
              ))}
            </select>
          </div>
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
            {rows.length !== data.rows.length ? (
              <p className="text-xs text-slate-500">
                Showing {rows.length} of {data.rows.length} movements.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Movements</p>
                <p className="text-lg font-semibold">
                  {summary.movementCount}
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Qty In</p>
                <p className="text-lg font-semibold text-emerald-800">
                  {formatNumber(summary.qtyIn, 2)}
                </p>
              </div>
              <div className="rounded-lg border bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Qty Out</p>
                <p className="text-lg font-semibold text-amber-800">
                  {formatNumber(summary.qtyOut, 2)}
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
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-sm text-slate-400"
                      >
                        No stock movements in this range
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
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
