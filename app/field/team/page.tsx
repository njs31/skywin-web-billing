import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { salesTeamDashboard } from "@/lib/queries/sales-team";
import type { TeamOrderStatus } from "@/lib/sales-team-status";
import { isSalesManager } from "@/lib/user-roles";
import { formatCurrency, formatDateTimeIST } from "@/lib/utils";

const STATUSES: Array<TeamOrderStatus | "All"> = [
  "All",
  "Paid",
  "Shipped",
  "Partly refunded",
  "Refunded",
  "Cancelled",
];

function phoneLabel(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return "—";
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

function statusClass(status: TeamOrderStatus) {
  if (status === "Cancelled" || status === "Refunded") return "bg-[#F8E8E6] text-[#8E3B34]";
  if (status === "Shipped") return "bg-[#E7F0E4] text-[#245B3E]";
  if (status === "Partly refunded") return "bg-[#F8F1D8] text-[#6B5420]";
  return "bg-[#EEF1E6] text-[#1E3317]";
}

export default async function SalesTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ officer?: string; status?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isSalesManager(user.role) && user.role !== "admin") redirect("/field");

  const params = await searchParams;
  const officerFilter = Number(params.officer || "");
  const statusFilter = STATUSES.includes(params.status as TeamOrderStatus | "All")
    ? (params.status as TeamOrderStatus | "All")
    : "All";
  const query = (params.q || "").trim().toLowerCase();
  const data = await salesTeamDashboard(user.id);
  const orders = data.orders.filter((order) => {
    if (Number.isFinite(officerFilter) && officerFilter > 0 && order.officerId !== officerFilter) return false;
    if (statusFilter !== "All" && order.status !== statusFilter) return false;
    if (!query) return true;
    return (
      order.farmer.toLowerCase().includes(query) ||
      order.invoiceNo.toLowerCase().includes(query) ||
      order.officerName.toLowerCase().includes(query)
    );
  });
  const shown = orders.slice(0, 200);

  const cards = [
    { label: "Field officers", value: String(data.officers.length), sub: "Reporting to you" },
    { label: "Farmers", value: String(data.farmerCount), sub: "Assigned to your officers" },
    { label: "Orders", value: String(data.orderCount), sub: formatCurrency(data.amount) },
    {
      label: "Open orders",
      value: String(data.statusCounts.Paid + data.statusCounts.Shipped),
      sub: `${data.statusCounts.Cancelled} cancelled`,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5E6B62]">Sales officer</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-[#1E3317]">{user.name}</h1>
        <p className="mt-1 text-sm text-[#5E6B62]">
          Field officers on your team, the farmers assigned to them, and the orders they placed.
        </p>
      </div>

      <section aria-label="Team summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-[#1E3317]/10 bg-white px-4 py-3">
            <p className="text-xs font-medium text-[#5E6B62]">{card.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#1E3317]">{card.value}</p>
            <p className="mt-1 text-xs text-[#5E6B62]">{card.sub}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[#1E3317]">Field officers</h2>
        <div className="overflow-hidden rounded-lg border border-[#1E3317]/10 bg-white">
          {data.officers.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[#5E6B62]">No field officers are linked to this login yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-[#1E3317]/10 text-left text-xs text-[#5E6B62]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Field officer</th>
                    <th className="px-3 py-2 font-medium">Mobile</th>
                    <th className="px-3 py-2 text-right font-medium">Farmers</th>
                    <th className="px-3 py-2 text-right font-medium">Orders</th>
                    <th className="px-3 py-2 text-right font-medium">Today</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.officers.map((officer) => {
                    const on = officerFilter === officer.id;
                    return (
                      <tr key={officer.id} className="border-t border-[#1E3317]/10">
                        <td className="px-3 py-2.5">
                          <Link
                            href={on ? "/field/team" : `/field/team?officer=${officer.id}`}
                            className="font-medium text-[#245B3E] hover:underline"
                          >
                            {officer.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <a href={`tel:+91${officer.phone.replace(/\D/g, "").slice(-10)}`} className="hover:underline">
                            {phoneLabel(officer.phone)}
                          </a>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{officer.farmers}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{officer.orders}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{officer.todayOrders}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(officer.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#1E3317]">Orders</h2>
          <form method="get" className="flex flex-wrap items-center gap-2" action="/field/team">
            {Number.isFinite(officerFilter) && officerFilter > 0 ? (
              <input type="hidden" name="officer" value={String(officerFilter)} />
            ) : null}
            <label className="text-xs text-[#5E6B62]">
              Status
              <select
                name="status"
                defaultValue={statusFilter}
                className="ml-2 h-9 rounded-md border border-[#1E3317]/15 bg-white px-2 text-sm text-[#1E3317]"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                    {status !== "All" ? ` (${data.statusCounts[status]})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <input
              name="q"
              defaultValue={params.q || ""}
              placeholder="Farmer or invoice"
              className="h-9 rounded-md border border-[#1E3317]/15 bg-white px-3 text-sm"
            />
            <button
              type="submit"
              className="h-9 rounded-md bg-[#1E3317] px-3 text-sm font-medium text-white"
            >
              Show
            </button>
          </form>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#1E3317]/10 bg-white">
          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[#5E6B62]">No orders match this view.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-[#1E3317]/10 text-left text-xs text-[#5E6B62]">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Invoice</th>
                    <th className="px-3 py-2 font-medium">Field officer</th>
                    <th className="px-3 py-2 font-medium">Farmer</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((order) => (
                    <tr key={order.id} className="border-t border-[#1E3317]/10 align-top">
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#5E6B62]">{formatDateTimeIST(order.date)}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-[#1E3317]">{order.invoiceNo}</p>
                        {order.lines.length > 0 ? (
                          <p className="mt-1 max-w-xs text-xs text-[#5E6B62]">
                            {order.lines.map((line) => `${line.name} × ${line.qty}`).join(", ")}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">{order.officerName}</td>
                      <td className="px-3 py-2.5">{order.farmer}</td>
                      <td className="px-3 py-2.5 capitalize">{order.paymentMode}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(order.amount)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {orders.length > shown.length ? (
            <p className="border-t border-[#1E3317]/10 px-3 py-2 text-xs text-[#5E6B62]">
              Showing the latest {shown.length} of {orders.length} orders.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
