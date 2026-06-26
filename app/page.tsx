import Link from "next/link";
import {
  getTodaySalesTotal,
  getRecentSales,
  getTopSellingProducts,
} from "@/lib/actions/sales";
import { getLowStockProducts, getProductStats } from "@/lib/actions/products";
import { getPurchases } from "@/lib/actions/purchases";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, AlertTriangle, Truck } from "lucide-react";

export default async function DashboardPage() {
  const [todaySales, recentSales, lowStock, productStats, topProducts, purchases] =
    await Promise.all([
      getTodaySalesTotal(),
      getRecentSales(5),
      getLowStockProducts(10),
      getProductStats(),
      getTopSellingProducts(5),
      getPurchases(),
    ]);

  const stats = [
    {
      label: "Today's Sales",
      value: formatCurrency(todaySales.total),
      sub: `${todaySales.count} invoices`,
      icon: ShoppingCart,
      color: "text-emerald-600",
    },
    {
      label: "Products",
      value: String(productStats?.total ?? 0),
      sub: `${productStats?.lowStock ?? 0} low stock`,
      icon: Package,
      color: "text-blue-600",
    },
    {
      label: "Low Stock Items",
      value: String(lowStock.length),
      sub: "Below 10 units",
      icon: AlertTriangle,
      color: "text-amber-600",
    },
    {
      label: "Purchases",
      value: String(purchases.length),
      sub: "Recorded entries",
      icon: Truck,
      color: "text-violet-600",
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Overview of sales, stock, and purchases
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/pos">Open POS</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl bg-slate-100 p-3 ${stat.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-slate-400">{stat.sub}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <p className="text-sm text-slate-400">No sales yet today.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <Link
                          href={`/invoices/${sale.id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {sale.invoiceNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {new Date(sale.date).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(sale.grandTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Low Stock Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-slate-400">All products well stocked.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="max-w-xs truncate">
                        {product.name}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-amber-600">
                        {product.stockQty}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {topProducts.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Top Selling Products</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right">{row.totalQty}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(row.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
