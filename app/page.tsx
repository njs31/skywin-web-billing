import Link from "next/link";
import type { ReactNode } from "react";
import {
  getTodaySalesTotal,
  getRecentSales,
} from "@/lib/queries/sales";
import { getLowStockProducts, getProductStats } from "@/lib/queries/products";
import { getOutstandingSummary } from "@/lib/queries/payments";
import { getStockValuation } from "@/lib/queries/reports";
import {
  getSalesTrend,
  getPaymentModeMix,
  getBillTypeMix,
  getTopProductsChart,
} from "@/lib/queries/dashboard";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PaymentDonut } from "@/components/dashboard/charts";
import { SalesPerformance } from "@/components/dashboard/sales-performance";

function Section({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 pb-2 pt-3">
        <div>
          <h2 className="text-[17px] font-semibold text-slate-900">{title}</h2>
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function ModuleError({ what }: { what: string }) {
  return (
    <p className="py-6 text-center text-sm text-slate-500">
      Unable to load {what}.
    </p>
  );
}

function ViewAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="whitespace-nowrap text-[13px] font-medium text-emerald-700 hover:underline"
    >
      {label} →
    </Link>
  );
}

/** Null on failure so one broken query degrades its own module only. */
async function settled<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const [
    todaySales,
    recentSales,
    lowStockRows,
    productStats,
    outstanding,
    stockVal,
    salesTrend,
    paymentMix,
    billTypeMix,
    topProducts,
  ] = await Promise.all([
    settled(getTodaySalesTotal()),
    settled(getRecentSales(5)),
    settled(getLowStockProducts(10)),
    settled(getProductStats()),
    settled(getOutstandingSummary()),
    settled(getStockValuation()),
    settled(getSalesTrend(30)),
    settled(getPaymentModeMix(30)),
    settled(getBillTypeMix(30)),
    settled(getTopProductsChart(8, 30)),
  ]);

  const belowTen = productStats?.lowStock ?? 0;
  const lowStock = (lowStockRows ?? []).slice(0, 7);
  const netPosition =
    outstanding != null ? outstanding.receivables - outstanding.payables : null;
  const billTotal = billTypeMix
    ? billTypeMix[0].total + billTypeMix[1].total
    : 0;
  const maxOutstanding =
    outstanding != null
      ? Math.max(outstanding.receivables, outstanding.payables, 1)
      : 1;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Business overview for today</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/purchases/new">Purchase Entry</Link>
          </Button>
          <Button asChild>
            <Link href="/pos">Open POS</Link>
          </Button>
        </div>
      </div>

      {/* TODAY + INVENTORY — grouped KPI blocks, not floating cards */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section
          aria-label="Today"
          className="rounded-lg border border-slate-200 bg-white px-5 py-4"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Today
          </p>
          {todaySales && outstanding ? (
            <dl className="grid grid-cols-3 gap-4 divide-x divide-slate-100 [&>*:first-child]:pl-0 [&>*]:pl-4">
              <div>
                <dt className="text-xs text-slate-500">Today&apos;s Sales</dt>
                <dd className="mt-0.5 text-[26px] font-bold tabular-nums leading-tight text-emerald-700">
                  {formatCurrency(todaySales.total, { round: true })}
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-slate-500">
                  {todaySales.count} bills · R{" "}
                  {formatCurrency(todaySales.retail, { round: true })} · W{" "}
                  {formatCurrency(todaySales.wholesale, { round: true })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Bills</dt>
                <dd className="mt-0.5 text-[26px] font-bold tabular-nums leading-tight text-slate-900">
                  {todaySales.count}
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-slate-500">
                  Retail {todaySales.retailCount} · Wholesale{" "}
                  {todaySales.wholesaleCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Receivables</dt>
                <dd className="mt-0.5 text-[26px] font-bold tabular-nums leading-tight text-amber-700">
                  {formatCurrency(outstanding.receivables, { round: true })}
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-slate-500">
                  Payables{" "}
                  {formatCurrency(outstanding.payables, { round: true })}
                </dd>
              </div>
            </dl>
          ) : (
            <ModuleError what="today's figures" />
          )}
        </section>

        <section
          aria-label="Inventory"
          className="rounded-lg border border-slate-200 bg-white px-5 py-4"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Inventory
          </p>
          {stockVal && productStats ? (
            <dl className="grid grid-cols-3 gap-4 divide-x divide-slate-100 [&>*:first-child]:pl-0 [&>*]:pl-4">
              <div>
                <dt className="text-xs text-slate-500">Stock Value</dt>
                <dd className="mt-0.5 text-[26px] font-bold tabular-nums leading-tight text-slate-900">
                  {formatCurrency(stockVal.saleValue, { round: true })}
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-slate-500">
                  {stockVal.productCount.toLocaleString("en-IN")} products
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Products</dt>
                <dd className="mt-0.5 text-[26px] font-bold tabular-nums leading-tight text-slate-900">
                  {(productStats.total ?? 0).toLocaleString("en-IN")}
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-slate-500">
                  {belowTen.toLocaleString("en-IN")} below 10 units
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Low Stock</dt>
                <dd className="mt-0.5 text-[26px] font-bold tabular-nums leading-tight text-red-600">
                  {belowTen.toLocaleString("en-IN")}
                </dd>
                <dd className="mt-0.5 text-xs text-slate-500">
                  products need attention
                </dd>
              </div>
            </dl>
          ) : (
            <ModuleError what="inventory figures" />
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Section title="Sales performance" sub="Bill totals by day">
            {salesTrend ? (
              <SalesPerformance initial={salesTrend} />
            ) : (
              <ModuleError what="sales performance" />
            )}
          </Section>
        </div>
        <div className="lg:col-span-4">
          <Section title="Payment methods" sub="Last 30 days">
            {paymentMix ? (
              <PaymentDonut data={paymentMix} />
            ) : (
              <ModuleError what="payment methods" />
            )}
          </Section>
        </div>

        <div className="lg:col-span-6">
          <Section title="Sales by customer type" sub="Last 30 days">
            {billTypeMix ? (
              <div className="space-y-3">
                {billTypeMix.map((row, i) => {
                  const pct =
                    billTotal > 0 ? Math.round((row.total / billTotal) * 100) : 0;
                  return (
                    <div key={row.type}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium capitalize text-slate-700">
                          {row.label}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {row.count} bills
                        </span>
                      </div>
                      <div
                        role="img"
                        aria-label={`${row.label} ${formatCurrency(row.total, { round: true })}, ${pct} percent`}
                        className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
                      >
                        <div
                          className={`h-full rounded-full ${i === 0 ? "bg-emerald-600" : "bg-sky-600"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                        {formatCurrency(row.total, { round: true })}
                        <span className="ml-1.5 text-xs font-normal tabular-nums text-slate-500">
                          {pct}%
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <ModuleError what="sales by customer type" />
            )}
          </Section>
        </div>
        <div className="lg:col-span-6">
          <Section title="Outstanding balances">
            {outstanding ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-3 gap-4">
                  <div>
                    <dt className="text-xs text-slate-500">Receivable</dt>
                    <dd className="mt-0.5 text-xl font-bold tabular-nums text-amber-700">
                      {formatCurrency(outstanding.receivables, { round: true })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Payable</dt>
                    <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                      {formatCurrency(outstanding.payables, { round: true })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Net position</dt>
                    <dd
                      className={`mt-0.5 text-xl font-bold tabular-nums ${netPosition != null && netPosition >= 0 ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {netPosition == null
                        ? "—"
                        : `${netPosition < 0 ? "−" : ""}${formatCurrency(Math.abs(netPosition), { round: true })}`}
                    </dd>
                  </div>
                </dl>
                <div className="space-y-2">
                  {[
                    {
                      label: `Receivable ${formatCurrency(outstanding.receivables, { round: true })}`,
                      value: outstanding.receivables,
                      bar: "bg-amber-500",
                    },
                    {
                      label: `Payable ${formatCurrency(outstanding.payables, { round: true })}`,
                      value: outstanding.payables,
                      bar: "bg-slate-400",
                    },
                  ].map((row) => (
                    <div key={row.label}>
                      <div
                        role="img"
                        aria-label={row.label}
                        className="h-2 overflow-hidden rounded-full bg-slate-100"
                      >
                        <div
                          className={`h-full rounded-full ${row.bar}`}
                          style={{
                            width: `${Math.round((row.value / maxOutstanding) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{row.label}</p>
                    </div>
                  ))}
                </div>
                <Link
                  href="/accounts/outstanding"
                  className="inline-block text-[13px] font-medium text-emerald-700 hover:underline"
                >
                  Open outstanding →
                </Link>
              </div>
            ) : (
              <ModuleError what="outstanding balances" />
            )}
          </Section>
        </div>

        <div className="lg:col-span-6">
          <Section
            title="Recent invoices"
            sub="Latest 5 invoices"
            action={<ViewAll href="/invoices" label="View all invoices" />}
          >
            {recentSales ? (
              recentSales.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  No sales yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="whitespace-nowrap text-sm font-medium">
                          <Link
                            href={`/invoices/${sale.id}`}
                            className="text-emerald-700 hover:underline"
                          >
                            {sale.invoiceNo}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs capitalize text-slate-500">
                          {sale.billType}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-[13px] text-slate-600">
                          {formatDateTimeIST(sale.date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                          {formatCurrency(sale.grandTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : (
              <ModuleError what="recent invoices" />
            )}
          </Section>
        </div>
        <div className="lg:col-span-6">
          <Section
            title="Low stock"
            sub={
              belowTen > 0
                ? `${lowStock.length} lowest of ${belowTen.toLocaleString("en-IN")} products below 10 units`
                : undefined
            }
            action={<ViewAll href="/stock" label="View all" />}
          >
            {lowStockRows ? (
              lowStock.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  All stocked — no action needed.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Reorder level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStock.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="max-w-56 truncate text-sm">
                          {product.name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-amber-700">
                          {product.stockQty}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-[13px] tabular-nums text-slate-500">
                          {product.reorderLevel ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : (
              <ModuleError what="low stock" />
            )}
          </Section>
        </div>

        <div className="lg:col-span-12">
          <Section
            title="Top products by revenue"
            sub="Last 30 days"
            action={<ViewAll href="/products" label="View all" />}
          >
            {topProducts ? (
              topProducts.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  No product sales in the last 30 days.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((row) => (
                      <TableRow key={row.fullName}>
                        <TableCell className="max-w-md truncate text-sm font-medium">
                          <Link
                            href={`/products?q=${encodeURIComponent(row.fullName)}`}
                            className="hover:text-emerald-700 hover:underline"
                            title={row.fullName}
                          >
                            {row.fullName}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-slate-600">
                          {row.qty}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                          {formatCurrency(row.revenue, { round: true })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : (
              <ModuleError what="top products" />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
