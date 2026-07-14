"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText, Search } from "lucide-react";
import { getSalesReportData } from "@/lib/actions/sales";
import type { SalesReportData } from "@/lib/queries/sales";
import { BUSINESS } from "@/lib/business";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function invoiceSheetRows(data: SalesReportData) {
  return data.invoices.map((inv, index) => ({
    "S.No.": index + 1,
    Invoice: inv.invoiceNo,
    Date: formatDateTimeIST(inv.date),
    "Bill Type": inv.billType,
    Customer: inv.customerName,
    Payment: inv.paymentMode,
    Operator: inv.operatorName,
    Subtotal: inv.subtotal,
    Discount: inv.discountAmount,
    CGST: inv.cgst,
    SGST: inv.sgst,
    IGST: inv.igst,
    "Grand Total": inv.grandTotal,
    Paid: inv.paidAmount,
  }));
}

function lineItemSheetRows(data: SalesReportData) {
  return data.lineItems.map((item, index) => ({
    "S.No.": index + 1,
    Invoice: item.invoiceNo,
    Date: formatDateTimeIST(item.date),
    "Bill Type": item.billType,
    Customer: item.customerName,
    Payment: item.paymentMode,
    Product: item.productName,
    HSN: item.hsnCode,
    Qty: item.qty,
    Rate: item.rate,
    "Discount Type": item.discountType,
    Discount: item.discountValue,
    "GST %": item.gstRate,
    Amount: item.amount,
  }));
}

function exportExcel(data: SalesReportData) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(invoiceSheetRows(data)),
    "Invoices"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(lineItemSheetRows(data)),
    "Line Items"
  );
  XLSX.writeFile(
    wb,
    `Skywin-Sales-Report-${data.fromDate}-to-${data.toDate}.xlsx`
  );
}

function exportPdf(data: SalesReportData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const { summary } = data;

  doc.setFontSize(14);
  doc.text(BUSINESS.name, 14, 14);
  doc.setFontSize(11);
  doc.text(BUSINESS.tagline, 14, 20);
  doc.setFontSize(9);
  doc.text(BUSINESS.address, 14, 26);
  doc.text(`Phone: ${BUSINESS.phone} | GSTIN: ${BUSINESS.gstin}`, 14, 31);
  doc.text(`Sales Report: ${data.fromDate} to ${data.toDate}`, 14, 37);
  doc.text(
    `Bills: ${summary.billCount} (R: ${summary.retailCount} / W: ${summary.wholesaleCount}) | Total: Rs. ${summary.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} | CGST: ${summary.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })} | SGST: ${summary.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    14,
    42
  );

  autoTable(doc, {
    startY: 46,
    head: [[
      "S.No",
      "Invoice",
      "Date",
      "Type",
      "Customer",
      "Payment",
      "Subtotal",
      "Discount",
      "CGST",
      "SGST",
      "Total",
      "Paid",
    ]],
    body: data.invoices.map((inv, i) => [
      i + 1,
      inv.invoiceNo,
      formatDateTimeIST(inv.date),
      inv.billType,
      inv.customerName,
      inv.paymentMode,
      inv.subtotal,
      inv.discountAmount,
      inv.cgst,
      inv.sgst,
      inv.grandTotal,
      inv.paidAmount,
    ]),
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [15, 81, 50], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
  });

  if (data.lineItems.length > 0) {
    doc.addPage();
    doc.setFontSize(12);
    doc.text("Line Items Detail", 14, 14);
    doc.setFontSize(9);
    doc.text(`Sales Report: ${data.fromDate} to ${data.toDate}`, 14, 20);

    autoTable(doc, {
      startY: 24,
      head: [[
        "S.No",
        "Invoice",
        "Date",
        "Customer",
        "Product",
        "HSN",
        "Qty",
        "Rate",
        "Disc",
        "GST%",
        "Amount",
      ]],
      body: data.lineItems.map((item, i) => [
        i + 1,
        item.invoiceNo,
        formatDateTimeIST(item.date),
        item.customerName,
        item.productName,
        item.hsnCode || "-",
        item.qty,
        item.rate,
        item.discountValue,
        item.gstRate,
        item.amount,
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.2 },
      headStyles: { fillColor: [15, 81, 50], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 10, right: 10 },
    });
  }

  doc.save(`Skywin-Sales-Report-${data.fromDate}-to-${data.toDate}.pdf`);
}

export function SalesReport() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [activeQuick, setActiveQuick] = useState<number | null>(null);
  const [report, setReport] = useState<SalesReportData | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const loadReport = (from = fromDate, to = toDate) => {
    setError("");
    startTransition(async () => {
      try {
        const data = await getSalesReportData(from, to);
        setReport(data);
      } catch (err) {
        setReport(null);
        setError(err instanceof Error ? err.message : "Failed to load sales report.");
      }
    });
  };

  const applyQuickRange = (days: number) => {
    const from = daysAgo(days);
    const to = defaultToDate();
    setFromDate(from);
    setToDate(to);
    setActiveQuick(days);
    loadReport(from, to);
  };

  const handleExport = (format: "excel" | "pdf") => {
    if (!report || report.invoices.length === 0) {
      setError("No sales data to export. Generate the report first.");
      return;
    }
    setError("");
    try {
      if (format === "excel") exportExcel(report);
      else exportPdf(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sales Report</CardTitle>
          <p className="text-sm text-slate-500">
            Select a date range to view detailed sales invoices and line items. Export to Excel or PDF.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_RANGES.map((range) => (
              <Button
                key={range.days}
                type="button"
                size="sm"
                variant={activeQuick === range.days ? "default" : "outline"}
                disabled={isPending}
                onClick={() => applyQuickRange(range.days)}
                className={
                  activeQuick === range.days
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : ""
                }
              >
                {range.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-slate-600">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setActiveQuick(null);
                }}
                className="mt-1 h-10 w-44 bg-white"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-600">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setActiveQuick(null);
                }}
                className="mt-1 h-10 w-44 bg-white"
              />
            </div>
            <Button
              type="button"
              onClick={() => loadReport()}
              disabled={isPending || !fromDate || !toDate}
              className="h-10 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Search className="h-4 w-4" />
              {isPending ? "Loading..." : "Generate Report"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!report || report.invoices.length === 0}
              onClick={() => handleExport("excel")}
              className="h-10 gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!report || report.invoices.length === 0}
              onClick={() => handleExport("pdf")}
              className="h-10 gap-2"
            >
              <FileText className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Bills</p>
                <p className="text-2xl font-bold">{report.summary.billCount}</p>
                <p className="text-xs text-slate-500">
                  Retail {report.summary.retailCount} · Wholesale {report.summary.wholesaleCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Grand Total</p>
                <p className="text-2xl font-bold text-emerald-700">
                  {formatCurrency(report.summary.grandTotal)}
                </p>
                <p className="text-xs text-slate-500">
                  Paid {formatCurrency(report.summary.paidAmount)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Taxable / Discount</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(report.summary.subtotal)}
                </p>
                <p className="text-xs text-slate-500">
                  Discount {formatCurrency(report.summary.discountAmount)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">GST</p>
                <p className="text-sm font-medium">
                  CGST {formatCurrency(report.summary.cgst)}
                </p>
                <p className="text-sm font-medium">
                  SGST {formatCurrency(report.summary.sgst)}
                </p>
                {report.summary.igst > 0 ? (
                  <p className="text-sm font-medium">
                    IGST {formatCurrency(report.summary.igst)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {Object.keys(report.summary.byPaymentMode).length > 0 ? (
            <Card>
              <CardContent className="flex flex-wrap gap-4 p-4">
                {Object.entries(report.summary.byPaymentMode).map(([mode, info]) => (
                  <div key={mode} className="min-w-[120px]">
                    <p className="text-xs capitalize text-slate-500">{mode}</p>
                    <p className="font-semibold">{formatCurrency(info.amount)}</p>
                    <p className="text-xs text-slate-400">{info.count} bills</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Tabs defaultValue="invoices">
            <TabsList>
              <TabsTrigger value="invoices">
                Invoices ({report.invoices.length})
              </TabsTrigger>
              <TabsTrigger value="items">
                Line Items ({report.lineItems.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invoices">
              <Card>
                <CardContent className="p-0">
                  {report.invoices.length === 0 ? (
                    <p className="p-6 text-sm text-slate-400">
                      No sales found for the selected date range.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Payment</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                            <TableHead className="text-right">Discount</TableHead>
                            <TableHead className="text-right">CGST</TableHead>
                            <TableHead className="text-right">SGST</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.invoices.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-medium">
                                {inv.invoiceNo}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatDateTimeIST(inv.date)}
                              </TableCell>
                              <TableCell className="capitalize">{inv.billType}</TableCell>
                              <TableCell>{inv.customerName}</TableCell>
                              <TableCell className="capitalize">
                                {inv.paymentMode}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(inv.subtotal)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(inv.discountAmount)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(inv.cgst)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(inv.sgst)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrency(inv.grandTotal)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button asChild size="sm" variant="outline">
                                  <Link href={`/invoices/${inv.id}`}>View</Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="items">
              <Card>
                <CardContent className="p-0">
                  {report.lineItems.length === 0 ? (
                    <p className="p-6 text-sm text-slate-400">
                      No line items for the selected date range.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>HSN</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Disc</TableHead>
                            <TableHead className="text-right">GST %</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.lineItems.map((item, index) => (
                            <TableRow key={`${item.invoiceNo}-${index}`}>
                              <TableCell className="font-medium">
                                {item.invoiceNo}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatDateTimeIST(item.date)}
                              </TableCell>
                              <TableCell>{item.customerName}</TableCell>
                              <TableCell className="max-w-xs">{item.productName}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {item.hsnCode || "-"}
                              </TableCell>
                              <TableCell className="text-right">{item.qty}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(item.rate)}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.discountValue}
                                {item.discountType === "percent" ? "%" : ""}
                              </TableCell>
                              <TableCell className="text-right">{item.gstRate}%</TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
