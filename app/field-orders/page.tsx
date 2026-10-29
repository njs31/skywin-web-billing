import Link from "next/link";
import { listFieldOrders } from "@/lib/queries/field-orders";
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
  const data = await listFieldOrders();

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold">Field orders</h1>
        <p className="text-sm text-slate-500">
          Orders placed by farmers and field officers. Each line is the billing batch that was deducted.
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
          <h2 className="text-base font-semibold">All field invoices</h2>
          <p className="text-sm text-slate-500">{data.orders.length} shown</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Field order</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Officer</TableHead>
              <TableHead>Farmer</TableHead>
              <TableHead>Items / batch</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No field orders yet. Place one from the Field Officer app after UPI.
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
                      {l.expiry ? ` · exp ${l.expiry}` : ""}
                    </div>
                  ))}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(o.grandTotal)}
                  <div className="text-xs font-normal text-slate-500">{o.paymentMode.toUpperCase()}</div>
                </TableCell>
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
