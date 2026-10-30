import Link from "next/link";
import { fieldOrdersDashboard } from "@/lib/actions/field";
import { delhiveryTrackUrl } from "@/lib/queries/field-orders";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";

export default async function FieldOrdersAdminPage() {
  const data = await fieldOrdersDashboard();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#1E3317]">Orders</h1>
        <p className="mt-1 text-sm text-[#5E6B62]">
          {data.orders.length} {data.orders.length === 1 ? "order" : "orders"} from the Field app. Each one
          shows the products, the amount paid, the Razorpay transaction, and Delhivery tracking.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today" value={String(data.todayCount)} sub="orders" />
        <Stat label="Today paid" value={formatCurrency(data.todayTotal)} sub="collected" />
        <Stat label="This month" value={String(data.monthCount)} sub="orders" />
        <Stat label="Month value" value={formatCurrency(data.monthTotal)} sub="invoices" />
      </div>
      {data.orders.length === 0 ? (
        <div className="rounded-lg border border-[#1E3317]/10 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-[#1E3317]">No orders yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[#5E6B62]">
            An order appears here after a farmer pays in the app.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.orders.map((order) => (
            <article key={order.id} className="rounded-lg border border-[#1E3317]/10 bg-white">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E3317]/10 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#1E3317]">
                    {order.externalOrderId || order.invoiceNo}
                  </p>
                  <p className="mt-0.5 text-xs text-[#5E6B62]">{formatDateTimeIST(order.date)}</p>
                </div>
                <Link
                  href={`/invoices/${order.id}`}
                  className="text-sm font-medium text-[#245B3E] hover:underline"
                >
                  {order.invoiceNo}
                </Link>
              </header>
              <div className="grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
                <div>
                  <p className="text-xs font-medium text-[#5E6B62]">Products</p>
                  <ul className="mt-2 space-y-1.5">
                    {order.lines.length === 0 ? (
                      <li className="text-sm text-[#5E6B62]">No product lines on this invoice.</li>
                    ) : (
                      order.lines.map((line, index) => (
                        <li key={`${order.id}-${index}`} className="flex items-start justify-between gap-3 text-sm">
                          <span className="min-w-0 text-[#1E3317]">
                            {line.name} × {line.qty}
                            {line.batchNumber ? (
                              <span className="block text-xs text-[#5E6B62]">Batch {line.batchNumber}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-[#29332C]">{formatCurrency(line.amount)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-[#5E6B62]">Farmer</dt>
                    <dd className="font-medium text-[#1E3317]">{order.customerName || "—"}</dd>
                    {order.customerPhone ? <dd className="text-xs text-[#5E6B62]">{order.customerPhone}</dd> : null}
                  </div>
                  <div>
                    <dt className="text-xs text-[#5E6B62]">Officer</dt>
                    <dd className="text-[#1E3317]">{(order.operatorName ?? "").replace(/^Field · /, "") || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#5E6B62]">Amount paid</dt>
                    <dd className="font-semibold tabular-nums text-[#1E3317]">{formatCurrency(order.paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#5E6B62]">Transaction id</dt>
                    <dd className="break-all font-mono text-xs text-[#1E3317]">
                      {order.razorpayPaymentId || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#5E6B62]">Tracking</dt>
                    <dd>
                      {order.waybill ? (
                        <a
                          href={delhiveryTrackUrl(order.waybill)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-[#245B3E] hover:underline"
                        >
                          Delhivery {order.waybill}
                        </a>
                      ) : (
                        <span className="text-[#5E6B62]">No tracking yet</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-[#1E3317]/10 bg-white px-4 py-3">
      <p className="text-xs font-medium text-[#5E6B62]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#1E3317]">{value}</p>
      <p className="text-xs text-[#5E6B62]">{sub}</p>
    </div>
  );
}
