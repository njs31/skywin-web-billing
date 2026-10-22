"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText, Search, ChevronDown, Download } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
import {
  emptySalesReportFilter,
  filterSalesReport,
  SALES_BILL_TYPES,
  SALES_GST_FILTERS,
  SALES_PAYMENT_MODES,
  SALES_SETTLEMENTS,
  SALES_TAX_SPLITS,
  type SalesReportFilter,
} from "@/lib/report-filters";

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
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
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

const selectClass =
  "mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800";

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-slate-600">{label}</Label>
      <select
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SalesReport() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [activeQuick, setActiveQuick] = useState<number | "custom" | null>(null);
  const [filters, setFilters] = useState(emptySalesReportFilter);
  const [report, setReport] = useState<SalesReportData | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const view = useMemo(
    () => (report ? { ...report, ...filterSalesReport(report, filters) } : null),
    [report, filters]
  );

  const setFilter = <K extends keyof SalesReportFilter>(
    key: K,
    value: SalesReportFilter[K]
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const loadReport = (from = fromDate, to = toDate) => {
    setError("");
    startTransition(async () => {
      try {
        const data = await getSalesReportData(from, to);
        setReport(data);
      } catch (err) {
        setReport(null);
        setError(err instanceof Error ? err.message : "Failed to load sales view.");
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
    if (!view || view.invoices.length === 0) {
      setError("No sales data to export. Generate the report first.");
      return;
    }
    setError("");
    try {
      if (format === "excel") exportExcel(view);
      else exportPdf(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    }
  };

  return (
    <div className="space-y-4">
    <section aria-label="Sales report" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold">Sales Report</h2>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick ranges">
          {QUICK_RANGES.map((range) => (
            <Button
              key={range.days}
              type="button"
              size="sm"
              variant={activeQuick === range.days ? "default" : "ghost"}
              disabled={isPending}
              onClick={() => applyQuickRange(range.days)}
              className={
                activeQuick === range.days
                  ? "h-8 bg-emerald-600 text-white hover:bg-emerald-700"
                  : "h-8 text-slate-600"
              }
            >
              {range.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={activeQuick === "custom" ? "default" : "ghost"}
            disabled={isPending}
            onClick={() => setActiveQuick("custom")}
            className={
              activeQuick === "custom"
                ? "h-8 bg-emerald-600 text-white hover:bg-emerald-700"
                : "h-8 text-slate-600"
            }
          >
            Custom range
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="report-from" className="text-xs text-slate-600">
            From
          </Label>
          <Input
            id="report-from"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setActiveQuick(null);
            }}
            className="mt-1 h-9 w-40 bg-white"
          />
        </div>
        <div>
          <Label htmlFor="report-to" className="text-xs text-slate-600">
            To
          </Label>
          <Input
            id="report-to"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setActiveQuick(null);
            }}
            className="mt-1 h-9 w-40 bg-white"
          />
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect
            label="Bill type"
            value={filters.billType}
            onChange={(value) => setFilter("billType", value)}
            options={SALES_BILL_TYPES.map((value) => ({
              value,
              label: value === "all" ? "All bill types" : value,
            }))}
          />
          <FilterSelect
            label="Payment"
            value={filters.paymentMode}
            onChange={(value) => setFilter("paymentMode", value)}
            options={SALES_PAYMENT_MODES.map((value) => ({
              value,
              label: value === "all" ? "All payments" : value.toUpperCase(),
            }))}
          />
          <FilterSelect
            label="GSTIN"
            value={filters.gst}
            onChange={(value) => setFilter("gst", value)}
            options={SALES_GST_FILTERS.map((value) => ({
              value,
              label:
                value === "all"
                  ? "All customers"
                  : value === "with"
                    ? "With GST number"
                    : "Without GST number",
            }))}
          />
          <FilterSelect
            label="Settlement"
            value={filters.settlement}
            onChange={(value) => setFilter("settlement", value)}
            options={SALES_SETTLEMENTS.map((value) => ({
              value,
              label: value === "all" ? "Paid and unpaid" : value,
            }))}
          />
          <FilterSelect
            label="Tax"
            value={filters.tax}
            onChange={(value) => setFilter("tax", value)}
            options={SALES_TAX_SPLITS.map((value) => ({
              value,
              label:
                value === "all"
                  ? "CGST/SGST and IGST"
                  : value === "intra"
                    ? "Within state (CGST/SGST)"
                    : "Other state (IGST)",
            }))}
          />
          <div>
            <Label className="text-xs text-slate-600">Customer</Label>
            <Input
              value={filters.customer}
              onChange={(event) => setFilter("customer", event.target.value)}
              placeholder="Name contains"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Product or SKU</Label>
            <Input
              value={filters.product}
              onChange={(event) => setFilter("product", event.target.value)}
              placeholder="Product or SKU"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Category</Label>
            <Input
              value={filters.category}
              onChange={(event) => setFilter("category", event.target.value)}
              placeholder="Category"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600">HSN</Label>
            <Input
              value={filters.hsn}
              onChange={(event) => setFilter("hsn", event.target.value)}
              placeholder="HSN"
              className="mt-1 h-9 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Operator</Label>
            <Input
              value={filters.operator}
              onChange={(event) => setFilter("operator", event.target.value)}
              placeholder="Billed by"
              className="mt-1 h-9 bg-white"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-9 text-slate-600"
          onClick={() => setFilters(emptySalesReportFilter())}
        >
          Clear filters
        </Button>
        <p className="w-full text-xs text-slate-500">
          Product, category, and HSN keep the whole bill in the invoice list and
          only the matching rows in line items. Excel and PDF use the filtered set.
        </p>
        <Button
          type="button"
          onClick={() => loadReport()}
          disabled={isPending || !fromDate || !toDate}
          className="h-9 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Search className="h-4 w-4" aria-hidden />
          {isPending ? "Loading…" : "Generate Report"}
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={!view || view.invoices.length === 0}
              className="h-9 gap-1.5"
              aria-label="Export report"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export
              <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 min-w-44 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-md"
            >
              <DropdownMenu.Item
                onSelect={() => handleExport("excel")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-700 outline-none focus:bg-emerald-50 focus:text-emerald-900"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                Export Excel
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => handleExport("pdf")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-700 outline-none focus:bg-emerald-50 focus:text-emerald-900"
              >
                <FileText className="h-4 w-4" aria-hidden />
                Export PDF
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>

      {view ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          {report && view.summary.billCount !== report.invoices.length ? (
            <p className="mb-2 text-xs text-slate-500">
              Showing {view.summary.billCount} of {report.invoices.length} bills.
              Excel and PDF use this filtered set.
            </p>
          ) : null}
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Bills</dt>
              <dd className="text-base font-semibold tabular-nums">
                {view.summary.billCount}
                <span className="ml-1.5 text-xs font-normal text-slate-500">
                  R {view.summary.retailCount} · W {view.summary.wholesaleCount}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Grand total</dt>
              <dd className="text-base font-semibold tabular-nums text-emerald-700">
                {formatCurrency(view.summary.grandTotal)}
                <span className="ml-1.5 text-xs font-normal text-slate-500">
                  Paid {formatCurrency(view.summary.paidAmount)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Taxable / Discount</dt>
              <dd className="text-base font-semibold tabular-nums">
                {formatCurrency(view.summary.subtotal)}
                <span className="ml-1.5 text-xs font-normal text-slate-500">
                  − {formatCurrency(view.summary.discountAmount)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">GST</dt>
              <dd className="text-base font-semibold tabular-nums">
                {formatCurrency(
                  view.summary.cgst + view.summary.sgst + view.summary.igst
                )}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {view ? (
        <>
            <Card>
              <CardContent className="flex flex-wrap gap-4 p-4">
                {sortPaymentModeEntries(
                  Object.entries(view.summary.byPaymentMode)
                ).map(([mode, info]) => (
                  <div key={mode} className="min-w-[120px]">
                    <p className="text-xs capitalize text-slate-500">{mode}</p>
                    <p className="font-semibold">{formatCurrency(info.amount)}</p>
                    <p className="text-xs text-slate-400">{info.count} bills</p>
                  </div>
                ))}
              </CardContent>
            </Card>

          <Tabs defaultValue="invoices">
            <TabsList>
              <TabsTrigger value="invoices">
                Invoices ({view.invoices.length})
              </TabsTrigger>
              <TabsTrigger value="items">
                Line Items ({view.lineItems.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invoices">
              <Card>
                <CardContent className="p-0">
                  {view.invoices.length === 0 ? (
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
                          {view.invoices.map((inv, index) => (
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
                              {formatCurrency(view.summary.subtotal)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(view.summary.discountAmount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(view.summary.cgst)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(view.summary.sgst)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700">
                              {formatCurrency(view.summary.grandTotal)}
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
                  {view.lineItems.length === 0 ? (
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
                          {view.lineItems.map((item, index) => (
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
                                view.lineItems.reduce((s, i) => s + i.qty, 0)
                              )}
                            </TableCell>
                            <TableCell colSpan={9} />
                            <TableCell className="text-right text-emerald-700">
                              {formatCurrency(
                                view.lineItems.reduce((s, i) => s + i.amount, 0)
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

          {Object.keys(view.summary.receivedByMode || {}).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Amounts received by payment mode
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-6 p-4 pt-0">
                {sortPaymentModeEntries(
                  Object.entries(view.summary.receivedByMode).filter(
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
                      Object.values(view.summary.receivedByMode).reduce(
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
