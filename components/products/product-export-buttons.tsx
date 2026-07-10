"use client";

import { useState, useTransition } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText } from "lucide-react";
import { getStockExportData } from "@/lib/actions/products";
import type { StockExportRow } from "@/lib/queries/products";
import { BUSINESS } from "@/lib/business";
import { Button } from "@/components/ui/button";

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
    Status: row.status,
  }));
}

function exportExcel(rows: StockExportRow[]) {
  const dateStamp = new Date().toISOString().split("T")[0];
  const wb = XLSX.utils.book_new();
  const stockSheet = XLSX.utils.json_to_sheet(rowsToSheetData(rows));
  XLSX.utils.book_append_sheet(wb, stockSheet, "Stock");
  XLSX.writeFile(wb, `Skywin-Stock-Export-${dateStamp}.xlsx`);
}

function exportPdf(rows: StockExportRow[]) {
  const dateStamp = new Date().toISOString().split("T")[0];
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text(BUSINESS.name, 14, 14);
  doc.setFontSize(11);
  doc.text(BUSINESS.tagline, 14, 20);
  doc.setFontSize(9);
  doc.text(BUSINESS.address, 14, 26);
  doc.text(`Phone: ${BUSINESS.phone} | GSTIN: ${BUSINESS.gstin}`, 14, 31);
  doc.text(`Closing Stock - ${dateStamp}`, 14, 37);

  autoTable(doc, {
    startY: 42,
    head: [[
      "S.No",
      "Product",
      "SKU",
      "Barcode",
      "Category",
      "Unit",
      "Stock",
      "Reorder",
      "Pur. Rate",
      "Sale Rate",
      "W/S Rate",
      "MRP",
      "HSN",
      "GST%",
      "Expiry",
      "Pur. Value",
      "Sale Value",
    ]],
    body: rows.map((row) => [
      row.sno,
      row.name,
      row.sku,
      row.barcode,
      row.category,
      row.unit,
      row.stockQty,
      row.reorderLevel,
      row.purchaseRate,
      row.saleRate,
      row.wholesaleRate,
      row.mrp || "-",
      row.hsnCode,
      row.gstRate,
      row.expiryDate || "-",
      row.purchaseValue,
      row.saleValue,
    ]),
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: [15, 81, 50], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
  });

  doc.save(`Skywin-Stock-Export-${dateStamp}.pdf`);
}

export function ProductExportButtons() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const runExport = (format: "excel" | "pdf") => {
    setError("");
    startTransition(async () => {
      try {
        const rows = await getStockExportData();
        if (rows.length === 0) {
          setError("No products found to export.");
          return;
        }
        if (format === "excel") {
          exportExcel(rows);
        } else {
          exportPdf(rows);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => runExport("excel")}
          className="gap-2"
        >
          <FileSpreadsheet className="h-4 w-4" />
          {isPending ? "Exporting..." : "Export Excel"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => runExport("pdf")}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          {isPending ? "Exporting..." : "Export PDF"}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
