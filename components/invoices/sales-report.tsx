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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sortPaymentModeEntries } from "@/lib/sale-settlement";

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

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function lineItemTotals(data: SalesReportData) {
  return data.lineItems.reduce(
    (acc, item) => {
      acc.qty += item.qty;
      acc.amount += item.amount;
      return acc;
    },
    { qty: 0, amount: 0 }
  );
}

function invoiceSheetRows(data: SalesReportData) {
  const rows = data.invoices.map((inv, index) => ({
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
  const s = data.summary;
  rows.push({
    "S.No.": "" as unknown as number,
    Invoice: "GRAND TOTAL",
    Date: "",
    "Bill Type": "",
    Customer: "",
    Payment: "",
    Operator: "",
    Subtotal: s.subtotal,
    Discount: s.discountAmount,
    CGST: s.cgst,
    SGST: s.sgst,
    IGST: s.igst,
    "Grand Total": s.grandTotal,
    Paid: s.paidAmount,
  });
  return rows;
}

function lineItemSheetRows(data: SalesReportData) {
  const rows = data.lineItems.map((item, index) => ({
    "S.No.": index + 1,
    Invoice: item.invoiceNo,
    Date: formatDateTimeIST(item.date),
    "Bill Type": item.billType,
    Customer: item.customerName,
    "Customer GSTIN": item.customerGstin,
    "Customer State": item.customerState,
    Payment: item.paymentMode,
    Product: item.productName,
    SKU: item.sku,
    Category: item.category,
    Batch: item.batchNumber,
    Unit: item.unit,
    HSN: item.hsnCode,
    Qty: item.qty,
    Rate: item.rate,
    "Discount Type": item.discountType,
    Discount: item.discountValue,
    "GST %": item.gstRate,
    "Taxable Value": item.taxableValue,
    CGST: item.cgst,
    SGST: item.sgst,
    IGST: item.igst,
    Cost: item.cost,
    Margin: item.margin,
    Amount: item.amount,
    "Grand Total": item.grandTotal,
  }));
  const totals = lineItemTotals(data);
  const blankNum = "" as unknown as number;
  rows.push({
    "S.No.": blankNum,
    Invoice: "GRAND TOTAL",
    Date: "",
    "Bill Type": "",
    Customer: "",
    "Customer GSTIN": "",
    "Customer State": "",
    Payment: "",
    Product: "",
    SKU: "",
    Category: "",
    Batch: "",
    Unit: "",
    HSN: "",
    Qty: round2(totals.qty),
    Rate: blankNum,
    "Discount Type": "",
    Discount: blankNum,
    "GST %": blankNum,
    "Taxable Value": round2(totals.amount),
    CGST: blankNum,
    SGST: blankNum,
    IGST: blankNum,
    Cost: blankNum,
    Margin: blankNum,
    Amount: round2(totals.amount),
    "Grand Total": blankNum,
  });
  return rows;
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
  const receivedRows = sortPaymentModeEntries(
    Object.entries(data.summary.receivedByMode || {}).filter(([, amt]) => amt > 0)
  ).map(([mode, amount]) => ({
    Mode: mode.toUpperCase(),
    "Amount Received": amount,
  }));
  if (receivedRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(receivedRows),
      "Received by Mode"
    );
  }
  const paymentModeRows = sortPaymentModeEntries(
    Object.entries(data.summary.byPaymentMode || {})
  ).map(([mode, info]) => ({
    Mode: mode.toUpperCase(),
    Bills: info.count,
    Amount: info.amount,
  }));
  if (paymentModeRows.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(paymentModeRows),
      "Payment Mode Summary"
    );
  }
  XLSX.writeFile(
    wb,
    `Skywin-Sales-Report-${data.fromDate}-to-${data.toDate}.xlsx`
  );
}

function exportPdf(data: SalesReportData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const { summary } = data;
  const itemTotals = lineItemTotals(data);

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
      "Grand Total",
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
    foot: [[
      "",
      "GRAND TOTAL",
      "",
      "",
      "",
      "",
      summary.subtotal.toFixed(2),
      summary.discountAmount.toFixed(2),
      summary.cgst.toFixed(2),
      summary.sgst.toFixed(2),
      summary.grandTotal.toFixed(2),
      summary.paidAmount.toFixed(2),
    ]],
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [15, 81, 50], textColor: 255 },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
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
        "Grand Total",
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
        item.grandTotal,
      ]),
      foot: [[
        "",
        "GRAND TOTAL",
        "",
        "",
        "",
        "",
        round2(itemTotals.qty).toFixed(2),
        "",
        "",
        "",
        round2(itemTotals.amount).toFixed(2),
        "",
      ]],
      styles: { fontSize: 6.5, cellPadding: 1.2 },
      headStyles: { fillColor: [15, 81, 50], textColor: 255 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 10, right: 10 },
    });
  }

  const paymentEntries = sortPaymentModeEntries(
    Object.entries(summary.byPaymentMode || {}).filter(
      ([, info]) => info.amount > 0 || info.count > 0
    )
  );
  if (paymentEntries.length > 0) {
    doc.addPage();
    doc.setFontSize(12);
    doc.text("Amounts received by payment mode", 14, 14);
    doc.setFontSize(9);
    doc.text(`Sales Report: ${data.fromDate} to ${data.toDate}`, 14, 20);
    autoTable(doc, {
      startY: 26,
      head: [["Payment Mode", "Bills", "Amount Received"]],
      body: paymentEntries.map(([mode, info]) => [
        mode.toUpperCase(),
        String(info.count),
        info.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [15, 81, 50], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
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
            Select a date range to view detailed sales invoices and line items in
            ascending date / invoice order. Export to Excel or PDF.
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
                {sortPaymentModeEntries(
                  Object.entries(report.summary.byPaymentMode)
                ).map(([mode, info]) => (
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
                            <TableHead>S.No.</TableHead>
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
                          {report.invoices.map((inv, index) => (
                            <TableRow key={inv.id}>
                              <TableCell className="text-slate-500">
                                {index + 1}
                              </TableCell>
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
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={6}>Grand Total</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(report.summary.subtotal)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(report.summary.discountAmount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(report.summary.cgst)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(report.summary.sgst)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700">
                              {formatCurrency(report.summary.grandTotal)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
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
                            <TableHead>S.No.</TableHead>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Batch</TableHead>
                            <TableHead>HSN</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Disc</TableHead>
                            <TableHead className="text-right">GST %</TableHead>
                            <TableHead className="text-right">Taxable</TableHead>
                            <TableHead className="text-right">CGST</TableHead>
                            <TableHead className="text-right">SGST</TableHead>
                            <TableHead className="text-right">IGST</TableHead>
                            <TableHead className="text-right">Cost</TableHead>
                            <TableHead className="text-right">Margin</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.lineItems.map((item, index) => (
                            <TableRow key={`${item.invoiceNo}-${index}`}>
                              <TableCell className="text-slate-500">
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-medium">
                                {item.invoiceNo}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatDateTimeIST(item.date)}
                              </TableCell>
                              <TableCell>{item.customerName}</TableCell>
                              <TableCell className="max-w-xs">{item.productName}</TableCell>
                              <TableCell className="text-xs">{item.category || "-"}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {item.batchNumber || "-"}
                              </TableCell>
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
                              <TableCell className="text-right">
                                {formatCurrency(item.taxableValue)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(item.cgst)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(item.sgst)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(item.igst)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(item.cost)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(item.margin)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={8}>Grand Total</TableCell>
                            <TableCell className="text-right">
                              {round2(
                                report.lineItems.reduce((s, i) => s + i.qty, 0)
                              )}
                            </TableCell>
                            <TableCell colSpan={9} />
                            <TableCell className="text-right text-emerald-700">
                              {formatCurrency(
                                report.lineItems.reduce((s, i) => s + i.amount, 0)
                              )}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {Object.keys(report.summary.receivedByMode || {}).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Amounts received by payment mode
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-6 p-4 pt-0">
                {sortPaymentModeEntries(
                  Object.entries(report.summary.receivedByMode).filter(
                    ([, amt]) => amt > 0
                  )
                ).map(([mode, amount]) => (
                    <div key={mode} className="min-w-[120px]">
                      <p className="text-xs capitalize text-slate-500">{mode}</p>
                      <p className="text-lg font-semibold text-emerald-700">
                        {formatCurrency(amount)}
                      </p>
                    </div>
                  ))}
                <div className="min-w-[140px] border-l border-slate-200 pl-6">
                  <p className="text-xs text-slate-500">Total received</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(
                      Object.values(report.summary.receivedByMode).reduce(
                        (s, n) => s + n,
                        0
                      )
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
