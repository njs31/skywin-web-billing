import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Leaf, ShoppingBag, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/actions/auth";
import { salesTeamDashboard } from "@/lib/queries/sales-team";
import type { TeamOrderStatus } from "@/lib/sales-team-status";
import { isSalesManager } from "@/lib/user-roles";
import { formatCurrency } from "@/lib/utils";
import {
  Badge,
  EmptyState,
  MobileCard,
  PageHeader,
  Panel,
  StatCard,
  StatGrid,
  buttonClass,
  inputClass,
  tableClass,
  tdClass,
  thClass,
  theadClass,
  trClass,
  type Tone,
} from "@/components/field/kit";
import { getFieldLang } from "@/lib/field-lang";
import { fieldLocale, fieldText, fmt } from "@/lib/field-i18n";

const STATUSES: Array<TeamOrderStatus | "All"> = ["All", "Paid", "Shipped", "Partly refunded", "Refunded", "Cancelled"];

function phoneLabel(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return "—";
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

function statusTone(status: TeamOrderStatus): Tone {
  if (status === "Cancelled" || status === "Refunded") return "red";
  if (status === "Shipped") return "green";
  if (status === "Partly refunded") return "amber";
  return "lime";
}

export default async function SalesTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ officer?: string; status?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isSalesManager(user.role) && user.role !== "admin") redirect("/field");

  const lang = await getFieldLang();
  const tm = fieldText(lang).team;
  const locale = fieldLocale(lang);
  const stLabel = (s: string) => (tm as Record<string, string>)[`st_${s}`] ?? s;
  const when = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  const params = await searchParams;
  const officerFilter = Number(params.officer || "");
  const statusFilter = STATUSES.includes(params.status as TeamOrderStatus | "All") ? (params.status as TeamOrderStatus | "All") : "All";
  const query = (params.q || "").trim().toLowerCase();
  const data = await salesTeamDashboard(user.id);
  const orders = data.orders.filter((order) => {
    if (Number.isFinite(officerFilter) && officerFilter > 0 && order.officerId !== officerFilter) return false;
    if (statusFilter !== "All" && order.status !== statusFilter) return false;
    if (!query) return true;
    return order.farmer.toLowerCase().includes(query) || order.invoiceNo.toLowerCase().includes(query) || order.officerName.toLowerCase().includes(query);
  });
  const shown = orders.slice(0, 200);
  const filteredOfficer = data.officers.find((o) => o.id === officerFilter);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow={tm.eyebrow} title={user.name} description={tm.subtitle} />

      <StatGrid>
        <StatCard icon={<Users />} label={tm.statOfficers} value={String(data.officers.length)} sub={tm.statOfficersSub} />
        <StatCard icon={<Leaf />} label={tm.statFarmers} value={data.farmerCount.toLocaleString("en-IN")} sub={tm.statFarmersSub} />
        <StatCard dark icon={<ShoppingBag />} label={tm.statOrders} value={String(data.orderCount)} sub={formatCurrency(data.amount)} />
        <StatCard
          icon={<ClipboardList />}
          label={tm.statOpen}
          value={String(data.statusCounts.Paid + data.statusCounts.Shipped)}
          sub={fmt(tm.statOpenSub, { n: data.statusCounts.Cancelled })}
        />
      </StatGrid>

      <Panel title={tm.officers}>
        {data.officers.length === 0 ? (
          <EmptyState icon={<Users />} title={tm.noOfficers} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>{tm.colOfficer}</th>
                    <th className={thClass}>{tm.colMobile}</th>
                    <th className={`${thClass} text-right`}>{tm.colFarmers}</th>
                    <th className={`${thClass} text-right`}>{tm.colOrders}</th>
                    <th className={`${thClass} text-right`}>{tm.colToday}</th>
                    <th className={`${thClass} text-right`}>{tm.colAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.officers.map((officer) => {
                    const on = officerFilter === officer.id;
                    return (
                      <tr key={officer.id} className={`${trClass} ${on ? "bg-[#F4F8EF]" : ""}`}>
                        <td className={tdClass}>
                          <Link href={on ? "/field/team" : `/field/team?officer=${officer.id}`} className="font-semibold text-[#245B3E] hover:underline">
                            {officer.name}
                          </Link>
                        </td>
                        <td className={tdClass}>
                          <a href={`tel:+91${officer.phone.replace(/\D/g, "").slice(-10)}`} className="tabular-nums hover:underline">
                            {phoneLabel(officer.phone)}
                          </a>
                        </td>
                        <td className={`${tdClass} text-right tabular-nums`}>{officer.farmers}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{officer.orders}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{officer.todayOrders}</td>
                        <td className={`${tdClass} text-right font-semibold tabular-nums text-[#1E3317]`}>{formatCurrency(officer.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="md:hidden">
              {data.officers.map((officer) => (
                <MobileCard key={officer.id} href={officerFilter === officer.id ? "/field/team" : `/field/team?officer=${officer.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1E3317]">{officer.name}</p>
                      <p className="text-xs text-[#5E6B62]">
                        {phoneLabel(officer.phone)} · {officer.farmers} {tm.colFarmers}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums text-[#1E3317]">{formatCurrency(officer.amount)}</p>
                      <p className="text-xs text-[#5E6B62]">
                        {officer.orders} {tm.colOrders} · {officer.todayOrders} {tm.colToday}
                      </p>
                    </div>
                  </div>
                </MobileCard>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel
        title={tm.orders}
        description={
          filteredOfficer ? (
            <>
              {fmt(tm.filtered, { name: filteredOfficer.name })} ·{" "}
              <Link href="/field/team" className="font-semibold text-[#245B3E] hover:underline">
                {tm.clearFilter}
              </Link>
            </>
          ) : undefined
        }
        actions={
          <form method="get" className="flex flex-wrap items-center gap-2" action="/field/team">
            {Number.isFinite(officerFilter) && officerFilter > 0 ? <input type="hidden" name="officer" value={String(officerFilter)} /> : null}
            <label className="sr-only" htmlFor="team-status">
              {tm.status}
            </label>
            <select id="team-status" name="status" defaultValue={statusFilter} className={`${inputClass} h-9 w-auto`}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {stLabel(status)}
                  {status !== "All" ? ` (${data.statusCounts[status]})` : ""}
                </option>
              ))}
            </select>
            <input name="q" defaultValue={params.q || ""} placeholder={tm.searchPh} aria-label={tm.searchPh} className={`${inputClass} h-9 w-44`} />
            <button type="submit" className={buttonClass("primary", "sm")}>
              {tm.show}
            </button>
          </form>
        }
      >
        {shown.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title={tm.noOrders} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>{tm.colWhen}</th>
                    <th className={thClass}>{tm.colInvoice}</th>
                    <th className={thClass}>{tm.colOfficer}</th>
                    <th className={thClass}>{tm.colFarmer}</th>
                    <th className={`${thClass} text-right`}>{tm.colAmount}</th>
                    <th className={thClass}>{tm.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((order) => (
                    <tr key={order.id} className={trClass}>
                      <td className={`${tdClass} whitespace-nowrap text-[#5E6B62]`}>{when.format(new Date(order.date))}</td>
                      <td className={tdClass}>
                        <p className="font-semibold text-[#1E3317]">{order.invoiceNo}</p>
                        {order.lines.length > 0 ? (
                          <p className="mt-1 max-w-xs text-xs text-[#5E6B62]">{order.lines.map((line) => `${line.name} × ${line.qty}`).join(", ")}</p>
                        ) : null}
                      </td>
                      <td className={tdClass}>{order.officerName}</td>
                      <td className={tdClass}>
                        <p>{order.farmer}</p>
                        <p className="text-xs uppercase text-[#5E6B62]">{order.paymentMode}</p>
                      </td>
                      <td className={`${tdClass} text-right font-semibold tabular-nums text-[#1E3317]`}>{formatCurrency(order.amount)}</td>
                      <td className={tdClass}>
                        <Badge tone={statusTone(order.status)}>{stLabel(order.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lg:hidden">
              {shown.map((order) => (
                <MobileCard key={order.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1E3317]">{order.farmer}</p>
                      <p className="text-xs text-[#5E6B62]">
                        {order.invoiceNo} · {order.officerName} · {when.format(new Date(order.date))}
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="font-bold tabular-nums text-[#1E3317]">{formatCurrency(order.amount)}</p>
                      <Badge tone={statusTone(order.status)}>{stLabel(order.status)}</Badge>
                    </div>
                  </div>
                </MobileCard>
              ))}
            </div>
          </>
        )}
        {orders.length > shown.length ? (
          <p className="border-t border-[#1E3317]/8 bg-[#FAFBF7] px-4 py-2 text-xs text-[#5E6B62]">{fmt(tm.showingLatest, { shown: shown.length, total: orders.length })}</p>
        ) : null}
      </Panel>
    </div>
  );
}
