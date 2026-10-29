import Link from "next/link";
import { fieldOverview } from "@/lib/actions/field";
import { RefreshButton } from "@/components/field/refresh-button";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";

function titleCase(value: string) {
  const text = value.trim();
  if (!text) return "—";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function FieldOverviewPage() {
  const data = await fieldOverview();
  const todayLabel = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const cards = [
    {
      label: "Categories",
      value: String(data.categories),
      href: "/field/catalog",
      sub: `${data.subcategories} subcategories`,
    },
    {
      label: "Mapped SKUs",
      value: String(data.skuCount),
      href: "/field/catalog",
      sub: "Pinned to catalogue rails",
    },
    {
      label: "Today's UPI",
      value: formatCurrency(data.todayTotal),
      href: "/field/orders",
      sub: `${data.todayCount} field ${data.todayCount === 1 ? "invoice" : "invoices"}`,
    },
    {
      label: "This month",
      value: formatCurrency(data.monthTotal),
      href: "/field/orders",
      sub: `${data.monthCount} field ${data.monthCount === 1 ? "invoice" : "invoices"}`,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#1E3317]">Overview</h1>
          <p className="mt-1 text-sm text-[#5E6B62]">
            Catalogue, farmers, and field invoices for {todayLabel}.
          </p>
        </div>
        <RefreshButton />
      </div>

      <section aria-label="Operations summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-[#1E3317]/10 bg-white px-4 py-3 hover:border-[#1E3317]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3317]"
          >
            <p className="text-xs font-medium text-[#5E6B62]">{card.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#1E3317]">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-[#5E6B62]">{card.sub}</p>
          </Link>
        ))}
      </section>

      <div>
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#1E3317]">Recent field orders</h2>
            <Link href="/field/orders" className="text-xs font-medium text-[#245B3E] hover:underline">
              All field orders
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#1E3317]/10 bg-white">
            {data.recentOrders.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-[#1E3317]">No field orders yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-[#5E6B62]">
                  Invoices appear here after a farmer or officer pays in the Field app.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-[#1E3317]/10 text-left text-xs text-[#5E6B62]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Order</th>
                      <th className="px-3 py-2 font-medium">Farmer</th>
                      <th className="px-3 py-2 font-medium">Officer</th>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Payment</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((order) => (
                      <tr key={order.id} className="border-t border-[#1E3317]/10">
                        <td className="px-3 py-2.5">
                          <Link href={`/invoices/${order.id}`} className="font-medium text-[#245B3E] hover:underline">
                            {order.invoiceNo || order.externalOrderId || "Invoice"}
                          </Link>
                          {order.externalOrderId ? (
                            <p className="text-xs text-[#5E6B62]">{order.externalOrderId}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">{order.customerName || "—"}</td>
                        <td className="px-3 py-2.5">{(order.operatorName ?? "").replace(/^Field · /, "") || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[#5E6B62]">
                          {formatDateTimeIST(order.date)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                          {formatCurrency(order.grandTotal)}
                        </td>
                        <td className="px-3 py-2.5">{titleCase(order.paymentMode)}</td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-md bg-[#EEF1E6] px-1.5 py-0.5 text-xs font-medium text-[#245B3E]">
                            {titleCase(order.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
