import {
  getProductWiseSales,
  getPartyWiseSales,
  getDailySummary,
  getGrossProfitReport,
  getPurchaseBook,
} from "@/lib/queries/reports";
import { getSales } from "@/lib/queries/sales";
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

export default async function ReportsPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [sales, productWise, partyWise, daily, profit, purchases] =
    await Promise.all([
      getSales(),
      getProductWiseSales(monthStart),
      getPartyWiseSales(monthStart),
      getDailySummary(monthStart),
      getGrossProfitReport(monthStart),
      getPurchaseBook(monthStart),
    ]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-slate-500">
          Sale book, purchase book, product & party analysis — this month
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Revenue (MTD)</p>
            <p className="text-2xl font-bold text-emerald-700">
              {formatCurrency(profit.revenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Est. Cost</p>
            <p className="text-2xl font-bold">{formatCurrency(profit.cost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Gross Profit</p>
            <p className="text-2xl font-bold">
              {formatCurrency(profit.grossProfit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-slate-500">Margin</p>
            <p className="text-2xl font-bold">{profit.margin.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Purchases</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daily.slice(0, 15).map((d) => (
                <TableRow key={d.date}>
                  <TableCell>{d.date}</TableCell>
                  <TableCell className="text-right">{d.billCount}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(d.salesTotal)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(d.purchaseTotal)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold ${d.grossProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {formatCurrency(d.grossProfit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Product-wise Sales</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productWise.slice(0, 20).map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-xs truncate">
                      {p.productName}
                    </TableCell>
                    <TableCell className="text-right">{p.totalQty}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(p.totalAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Party-wise Sales</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Party</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partyWise.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>{p.customerName}</TableCell>
                    <TableCell className="text-right">{p.billCount}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(p.totalAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sale Book</CardTitle>
        </CardHeader>
        <CardContent className="max-h-80 overflow-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.slice(0, 30).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.invoiceNo}</TableCell>
                  <TableCell>
                    {new Date(s.date).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell className="capitalize">{s.billType}</TableCell>
                  <TableCell>
                    {s.customerRecordName ?? s.customerName ?? "Walk-in"}
                  </TableCell>
                  <TableCell className="capitalize">{s.paymentMode}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(s.grandTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase Book</CardTitle>
        </CardHeader>
        <CardContent className="max-h-80 overflow-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {new Date(p.date).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell>{p.invoiceNo ?? "-"}</TableCell>
                  <TableCell className="capitalize">{p.paymentType}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(p.grandTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
