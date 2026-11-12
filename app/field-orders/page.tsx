import Link from "next/link";
import { getCurrentUser } from "@/lib/actions/auth";
import { OrderRefundPanel } from "@/components/field/order-refund-panel";
import { delhiveryTrackUrl, listFieldOrders } from "@/lib/queries/field-orders";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function FieldOrdersPage() {
  const [data, user] = await Promise.all([listFieldOrders(), getCurrentUser()]);
  const canRefund = user?.role === "admin";

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-sm text-slate-500">
          Every order from the Field app. An administrator cancels an order here. Refunds, including a partial refund, are sent through Razorpay.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today" value={String(data.todayCount)} sub="orders" />
        <Stat label="Today UPI" value={formatCurrency(data.todayTotal)} sub="collected" />
        <Stat label="This month" value={String(data.monthCount)} sub="orders" />
        <Stat label="Month value" value={formatCurrency(data.monthTotal)} sub="invoices created" />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold">All orders</h2>
          <p className="text-sm text-slate-500">{data.orders.length} shown</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Officer</TableHead>
              <TableHead>Farmer</TableHead>
              <TableHead>Products</TableHead>
              <TableHead className="text-right">Amount paid</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Tracking</TableHead>
              {canRefund ? <TableHead>Refund</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={canRefund ? 10 : 9} className="py-10 text-center text-sm text-slate-500">
                  No orders yet. An order appears here after a farmer pays in the app.
                </TableCell>
              </TableRow>
            )}
            {data.orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="whitespace-nowrap text-sm text-slate-600">
                  {formatDateTimeIST(o.date)}
                </TableCell>
                <TableCell className="font-medium">{o.externalOrderId ?? "—"}</TableCell>
                <TableCell>
                  <Link href={`/invoices/${o.id}`} className="font-medium text-emerald-700 hover:underline">
                    {o.invoiceNo}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{(o.operatorName ?? "").replace(/^Field · /, "")}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{o.customerName ?? "—"}</div>
                  <div className="text-xs text-slate-500">{o.customerPhone ?? ""}</div>
                </TableCell>
                <TableCell className="max-w-xs text-xs text-slate-600">
                  {o.lines.map((l, i) => (
                    <div key={i}>
                      {l.name} × {l.qty}
                      {l.batchNumber ? ` · batch ${l.batchNumber}` : ""}
                      {l.amount ? ` · ${formatCurrency(l.amount)}` : ""}
                    </div>
                  ))}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(o.paid)}
                  <div className="text-xs font-normal text-slate-500">
                    {o.status === "cancelled" ? "Cancelled" : o.paymentMode.toUpperCase()}
                    {o.refunded > 0 ? ` · refunded ${formatCurrency(o.refunded)}` : ""}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{o.razorpayPaymentId ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {o.waybill ? (
                    <a
                      href={delhiveryTrackUrl(o.waybill)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-emerald-700 hover:underline"
                    >
                      {o.waybill}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                {canRefund ? (
                  <TableCell className="min-w-64 align-top">
                    <OrderRefundPanel
                      saleId={o.id}
                      invoiceNo={o.invoiceNo}
                      paid={o.paid}
                      refunded={o.refunded}
                      status={o.status}
                      paymentId={o.razorpayPaymentId}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}
