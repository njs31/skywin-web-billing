import Link from "next/link";
import { fieldOrdersDashboard } from "@/lib/actions/field";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";

export default async function FieldOrdersAdminPage() {
  const data = await fieldOrdersDashboard();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Field orders</h1>
        <p className="text-sm text-[#2E4A22]/70">
          Live invoices created when a field officer marks UPI paid.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today" value={String(data.todayCount)} sub="orders" />
        <Stat label="Today UPI" value={formatCurrency(data.todayTotal)} sub="collected" />
        <Stat label="This month" value={String(data.monthCount)} sub="orders" />
        <Stat label="Month value" value={formatCurrency(data.monthTotal)} sub="invoices" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FFF7F5] text-left text-xs uppercase tracking-wide text-[#2E4A22]/60">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Field order</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Officer</th>
              <th className="px-4 py-3">Farmer</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((order) => (
              <tr key={order.id} className="border-t border-[#1E3317]/10">
                <td className="px-4 py-3 whitespace-nowrap">{formatDateTimeIST(order.date)}</td>
                <td className="px-4 py-3">{order.externalOrderId ?? "—"}</td>
                <td className="px-4 py-3">
                  <Link href={`/invoices/${order.id}`} className="font-medium text-emerald-700 hover:underline">
                    {order.invoiceNo}
                  </Link>
                </td>
                <td className="px-4 py-3">{(order.operatorName ?? "").replace(/^Field · /, "")}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{order.customerName ?? "—"}</div>
                  <div className="text-xs text-[#2E4A22]/50">{order.customerPhone ?? ""}</div>
                </td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(order.grandTotal)}</td>
              </tr>
            ))}
            {data.orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#2E4A22]/50">
                  No field orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-[#1E3317]/10 bg-white p-4">
      <p className="text-xs font-medium text-[#2E4A22]/60">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="text-xs text-[#2E4A22]/50">{sub}</p>
    </div>
  );
}
