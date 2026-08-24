"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText } from "lucide-react";
import { getProductsExportData } from "@/lib/actions/products";
import type { ProductDateRangeExport, StockExportRow } from "@/lib/queries/products";
import { BUSINESS } from "@/lib/business";
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

function exportExcel(data: ProductDateRangeExport) {
  const wb = XLSX.utils.book_new();
  const stockSheet = XLSX.utils.json_to_sheet(rowsToSheetData(data.rows));
  XLSX.utils.book_append_sheet(wb, stockSheet, "Stock");
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

export function ProductExportButtons() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const runExport = (format: "excel" | "pdf", from = fromDate, to = toDate) => {
    setError("");
    startTransition(async () => {
      try {
        const data = await getProductsExportData(from, to);
        if (data.rows.length === 0) {
          setError("No products found to export.");
          return;
        }
        if (format === "excel") {
          exportExcel(data);
        } else {
          exportPdf(data);
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
          range
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
