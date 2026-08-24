import {
  getProductWiseSales,
  getPartyWiseSales,
  getDailySummary,
  getGrossProfitReport,
  getPurchaseBook,
} from "@/lib/queries/reports";
import { getSales } from "@/lib/queries/sales";
import { formatCurrency, formatDateIST } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TallyExportButton } from "@/components/reports/tally-export-button";
import { EwayExportButton } from "@/components/reports/eway-export-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  Package,
  Wallet,
  Percent,
  CalendarDays,
  ShoppingBag,
  Users,
  BookOpen,
  Truck,
} from "lucide-react";

function EmptyRows({ message }: { message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={10} className="h-24 text-center text-sm text-slate-400">
        {message}
      </TableCell>
    </TableRow>
  );
}

function SectionHeader({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      {typeof count === "number" && (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {count} {count === 1 ? "row" : "rows"}
        </span>
      )}
    </div>
  );
}

export default async function ReportsPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = now.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const [sales, productWise, partyWise, daily, profit, purchases] =
    await Promise.all([
      getSales(),
      getProductWiseSales(monthStart),
      getPartyWiseSales(monthStart),
      getDailySummary(monthStart),
      getGrossProfitReport(monthStart),
      getPurchaseBook(monthStart),
    ]);

  const dailyRows = daily.slice(0, 15);
  const productRows = productWise.slice(0, 20);
  const saleRows = sales.slice(0, 30);

  const kpis = [
    {
      label: "Revenue (MTD)",
      value: formatCurrency(profit.revenue),
      sub: monthLabel,
      icon: TrendingUp,
      accent: "bg-emerald-50 text-emerald-600",
      valueClass: "text-emerald-700",
    },
    {
      label: "Est. Cost",
      value: formatCurrency(profit.cost),
      sub: "Purchase cost estimate",
      icon: Package,
      accent: "bg-slate-100 text-slate-600",
      valueClass: "text-slate-900",
    },
    {
      label: "Gross Profit",
      value: formatCurrency(profit.grossProfit),
      sub: profit.grossProfit >= 0 ? "Positive this month" : "Loss this month",
      icon: Wallet,
      accent:
        profit.grossProfit >= 0
          ? "bg-teal-50 text-teal-600"
          : "bg-red-50 text-red-600",
      valueClass:
        profit.grossProfit >= 0 ? "text-teal-700" : "text-red-600",
    },
    {
      label: "Margin",
      value: `${profit.margin.toFixed(1)}%`,
      sub: "Gross margin %",
      icon: Percent,
      accent: "bg-amber-50 text-amber-600",
      valueClass: "text-amber-700",
    },
  ];

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Reports
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <CalendarDays className="h-3.5 w-3.5" />
              {monthLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Sale book, purchase book, product & party analysis for this month
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="overflow-hidden">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`rounded-xl p-3 ${kpi.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">{kpi.label}</p>
                  <p className={`truncate text-xl font-bold ${kpi.valueClass}`}>
                    {kpi.value}
                  </p>
                  <p className="text-xs text-slate-400">{kpi.sub}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Exports
          </h2>
          <p className="text-xs text-slate-400">
            Download accounting and e-Way bill workbooks for any date range
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TallyExportButton />
          <EwayExportButton />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Analysis
          </h2>
          <p className="text-xs text-slate-400">
            Daily performance and top movers this month
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                <CalendarDays className="h-4 w-4" />
              </div>
              <SectionHeader
                title="Daily Summary"
                description="Sales, purchases and estimated gross profit by day"
                count={dailyRows.length}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyRows.length === 0 ? (
                    <EmptyRows message="No daily activity this month yet." />
                  ) : (
                    dailyRows.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell className="font-medium text-slate-800">
                          {d.date}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.billCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(d.salesTotal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(d.purchaseTotal)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${
                            d.grossProfit >= 0
                              ? "text-emerald-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(d.grossProfit)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <SectionHeader
                  title="Product-wise Sales"
                  description="Top products by amount this month"
                  count={productRows.length}
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-96 overflow-auto p-0">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productRows.length === 0 ? (
                    <EmptyRows message="No product sales this month." />
                  ) : (
                    productRows.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-xs truncate font-medium">
                          {p.productName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.totalQty}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(p.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
                  <Users className="h-4 w-4" />
                </div>
                <SectionHeader
                  title="Party-wise Sales"
                  description="Customers ranked by billed amount"
                  count={partyWise.length}
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-96 overflow-auto p-0">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead>Party</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partyWise.length === 0 ? (
                    <EmptyRows message="No party sales this month." />
                  ) : (
                    partyWise.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {p.customerName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.billCount}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(p.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Books
          </h2>
          <p className="text-xs text-slate-400">
            Transaction registers for sales and purchases
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-violet-50 p-2 text-violet-600">
                <BookOpen className="h-4 w-4" />
              </div>
              <SectionHeader
                title="Sale Book"
                description="Recent invoices across retail and wholesale"
                count={saleRows.length}
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-80 overflow-auto p-0">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleRows.length === 0 ? (
                  <EmptyRows message="No sales recorded yet." />
                ) : (
                  saleRows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-slate-900">
                        {s.invoiceNo}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatDateIST(s.date)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            s.billType === "wholesale"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {s.billType}
                        </span>
                      </TableCell>
                      <TableCell>
                        {s.customerRecordName ?? s.customerName ?? "Walk-in"}
                      </TableCell>
                      <TableCell className="capitalize text-slate-600">
                        {s.paymentMode}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(s.grandTotal)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-orange-50 p-2 text-orange-600">
                <Truck className="h-4 w-4" />
              </div>
              <SectionHeader
                title="Purchase Book"
                description="Supplier invoices recorded this month"
                count={purchases.length}
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-80 overflow-auto p-0">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-white">
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.length === 0 ? (
                  <EmptyRows message="No purchases this month." />
                ) : (
                  purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-slate-600">
                        {formatDateIST(p.date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.supplierName}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {p.invoiceNo ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            p.paymentType === "cash"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {p.paymentType}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(p.grandTotal)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
