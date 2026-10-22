"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText } from "lucide-react";
import { getProductsExportData } from "@/lib/actions/products";
import type { ProductDateRangeExport, StockExportRow } from "@/lib/queries/products";
import { BUSINESS } from "@/lib/business";
import { duplicateHsnKeys, hsnKey } from "@/lib/duplicate-hsn";
import {
  emptyStockReportFilter,
  filterStockRows,
  STOCK_DUPLICATES,
  STOCK_EXPIRY,
  STOCK_LEVELS,
  STOCK_SOLD,
  STOCK_STATUSES,
  type StockReportFilter,
} from "@/lib/report-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function rowsToSheetData(rows: StockExportRow[]) {
  return rows.map((row) => ({
    "S.No.": row.sno,
    "Product ID": row.id,
    Product: row.name,
    SKU: row.sku,
    Barcode: row.barcode,
    Category: row.category,
    Unit: row.unit,
    "Stock Qty": row.stockQty,
    "Reorder Level": row.reorderLevel,
    "Purchase Rate": row.purchaseRate,
    "Sale Rate": row.saleRate,
    "Wholesale Rate": row.wholesaleRate,
    MRP: row.mrp,
    "HSN Code": row.hsnCode,
    "GST %": row.gstRate,
    "Expiry Date": row.expiryDate,
    "Purchase Value": row.purchaseValue,
    "Sale Value": row.saleValue,
    "Qty Sold (Range)": row.qtySold ?? 0,
    "Sales Amount (Range)": row.salesAmount ?? 0,
    Status: row.status,
  }));
}

function exportExcel(data: ProductDateRangeExport, catalog: StockExportRow[] = data.rows) {
  const wb = XLSX.utils.book_new();
  const stockSheet = XLSX.utils.json_to_sheet(rowsToSheetData(data.rows));
  XLSX.utils.book_append_sheet(wb, stockSheet, "Stock");
  const duplicateKeys = duplicateHsnKeys(catalog.map((row) => row.hsnCode));
  const duplicateRows = data.rows.filter((row) =>
    duplicateKeys.has(hsnKey(row.hsnCode))
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      duplicateRows.length > 0
        ? rowsToSheetData(duplicateRows)
        : [{ Note: "No products share an HSN code." }]
    ),
    "Duplicate HSN"
  );
  XLSX.writeFile(
    wb,
    `Skywin-Stock-Export-${data.fromDate}-to-${data.toDate}.xlsx`
  );
}

function exportPdf(data: ProductDateRangeExport) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text(BUSINESS.name, 14, 14);
  doc.setFontSize(11);
  doc.text(BUSINESS.tagline, 14, 20);
  doc.setFontSize(9);
  doc.text(BUSINESS.address, 14, 26);
  doc.text(`Phone: ${BUSINESS.phone} | GSTIN: ${BUSINESS.gstin}`, 14, 31);
  doc.text(
    `Stock + sales ${data.fromDate} to ${data.toDate}`,
    14,
    37
  );

  autoTable(doc, {
    startY: 42,
    head: [[
      "S.No",
      "Product",
      "SKU",
      "Barcode",
      "Category",
      "Stock",
      "Pur. Rate",
      "Sale Rate",
      "MRP",
      "HSN",
      "GST%",
      "Qty Sold",
      "Sales Amt",
      "Pur. Value",
      "Sale Value",
    ]],
    body: data.rows.map((row) => [
      row.sno,
      row.name,
      row.sku,
      row.barcode,
      row.category,
      row.stockQty,
      row.purchaseRate,
      row.saleRate,
      row.mrp || "-",
      row.hsnCode,
      row.gstRate,
      row.qtySold ?? 0,
      row.salesAmount ?? 0,
      row.purchaseValue,
      row.saleValue,
    ]),
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: [15, 81, 50], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
  });

  doc.save(`Skywin-Stock-Export-${data.fromDate}-to-${data.toDate}.pdf`);
}

const fieldClass =
  "mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800";

export function ProductExportButtons() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [filters, setFilters] = useState(emptyStockReportFilter);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const setFilter = <K extends keyof StockReportFilter>(
    key: K,
    value: StockReportFilter[K]
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const runExport = (format: "excel" | "pdf", from = fromDate, to = toDate) => {
    setError("");
    startTransition(async () => {
      try {
        const data = await getProductsExportData(from, to);
        const today = toDateInputValue(new Date());
        const rows = filterStockRows(data.rows, filters, today);
        if (rows.length === 0) {
          setError("No products match these filters.");
          return;
        }
        const filtered = { ...data, rows };
        if (format === "excel") {
          exportExcel(filtered, data.rows);
        } else {
          exportPdf(filtered);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed.");
      }
    });
  };

  const applyQuickRange = (days: number, format?: "excel" | "pdf") => {
    const from = daysAgo(days);
    const to = defaultToDate();
    setFromDate(from);
    setToDate(to);
    if (format) runExport(format, from, to);
  };

  return (
    <Card className="border-emerald-200 bg-emerald-50/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-emerald-800">
          Download Products
        </CardTitle>
        <p className="text-xs text-slate-500">
          Current stock plus qty sold and sales amount for the selected date
          range. Filters apply to the Excel and PDF download.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              className="h-9 w-40 bg-white"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              className="h-9 w-40 bg-white"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !fromDate || !toDate}
            onClick={() => runExport("excel")}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {isPending ? "Exporting..." : "Export Excel"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending || !fromDate || !toDate}
            onClick={() => runExport("pdf")}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            {isPending ? "Exporting..." : "Export PDF"}
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Product, SKU, or barcode</Label>
            <Input
              value={filters.q}
              onChange={(event) => setFilter("q", event.target.value)}
              placeholder="Search"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Input
              value={filters.category}
              onChange={(event) => setFilter("category", event.target.value)}
              placeholder="Category"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs">HSN</Label>
            <Input
              value={filters.hsn}
              onChange={(event) => setFilter("hsn", event.target.value)}
              placeholder="HSN"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs">GST %</Label>
            <Input
              value={filters.gstRate}
              onChange={(event) => setFilter("gstRate", event.target.value)}
              placeholder="Exact rate, e.g. 18"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <select
              className={fieldClass}
              value={filters.status}
              onChange={(event) =>
                setFilter("status", event.target.value as StockReportFilter["status"])
              }
            >
              {STOCK_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "Active and inactive" : value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Stock</Label>
            <select
              className={fieldClass}
              value={filters.stock}
              onChange={(event) =>
                setFilter("stock", event.target.value as StockReportFilter["stock"])
              }
            >
              {STOCK_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {value === "all"
                    ? "Any quantity"
                    : value === "in"
                      ? "In stock"
                      : value === "out"
                        ? "Out of stock"
                        : "Below reorder level"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Expiry</Label>
            <select
              className={fieldClass}
              value={filters.expiry}
              onChange={(event) =>
                setFilter("expiry", event.target.value as StockReportFilter["expiry"])
              }
            >
              {STOCK_EXPIRY.map((value) => (
                <option key={value} value={value}>
                  {value === "all"
                    ? "Any expiry"
                    : value === "dated"
                      ? "Has an expiry date"
                      : value === "none"
                        ? "No expiry date"
                        : value === "expired"
                          ? "Already expired"
                          : "Expires within 90 days"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Sales in range</Label>
            <select
              className={fieldClass}
              value={filters.sold}
              onChange={(event) =>
                setFilter("sold", event.target.value as StockReportFilter["sold"])
              }
            >
              {STOCK_SOLD.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "Sold and unsold" : value === "sold" ? "Sold in range" : "Not sold in range"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Duplicate HSN</Label>
            <select
              className={fieldClass}
              value={filters.duplicates}
              onChange={(event) =>
                setFilter(
                  "duplicates",
                  event.target.value as StockReportFilter["duplicates"]
                )
              }
            >
              {STOCK_DUPLICATES.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All HSN codes" : "Only shared HSN codes"}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              className="h-9 text-slate-600"
              onClick={() => setFilters(emptyStockReportFilter())}
            >
              Clear filters
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_RANGES.map((r) => (
            <Button
              key={r.days}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 bg-white text-xs"
              disabled={isPending}
              onClick={() => applyQuickRange(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
