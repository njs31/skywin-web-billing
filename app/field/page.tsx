import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FileText,
  IndianRupee,
  Leaf,
  Package,
  Sparkles,
  Truck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { fieldOverview } from "@/lib/actions/field";
import { orderLocationMapsUrl } from "@/lib/queries/field-orders";
import { RefreshButton } from "@/components/field/refresh-button";
import {
  Badge,
  EmptyState,
  MobileCard,
  PageHeader,
  Panel,
  StatCard,
  StatGrid,
  tableClass,
  tdClass,
  thClass,
  theadClass,
  trClass,
} from "@/components/field/kit";
import { getFieldLang } from "@/lib/field-lang";
import { fieldLocale, fieldText, fmt, plural } from "@/lib/field-i18n";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FieldOverviewPage() {
  const [data, lang] = await Promise.all([fieldOverview(), getFieldLang()]);
  const o = fieldText(lang).overview;
  const locale = fieldLocale(lang);
  const today = new Date().toLocaleDateString(locale, {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const when = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  const attention = [
    data.pendingDeletions > 0 && {
      href: "/field/deletions",
      icon: <UserX className="h-4 w-4" />,
      text: plural(data.pendingDeletions, o.pendingDeletion, o.pendingDeletions),
      tone: "bg-[#FBEAE8] text-[#8E3B34]",
    },
    data.ordersToDispatch > 0 && {
      href: "/field/orders",
      icon: <Truck className="h-4 w-4" />,
      text: plural(data.ordersToDispatch, o.toDispatchOne, o.toDispatch),
      tone: "bg-[#FFF4E0] text-[#8A5A00]",
    },
    data.productsNeedingDetails > 0 && {
      href: "/field/products",
      icon: <FileText className="h-4 w-4" />,
      text: fmt(o.productsMissing, { n: data.productsNeedingDetails.toLocaleString("en-IN") }),
      tone: "bg-[#EDF2E7] text-[#3E5E2F]",
    },
  ].filter(Boolean) as Array<{ href: string; icon: React.ReactNode; text: string; tone: string }>;

  const quick = [
    { href: "/field/farmers", icon: <UserPlus className="h-4 w-4" />, label: o.addFarmer },
    { href: "/field/officers", icon: <Users className="h-4 w-4" />, label: o.addOfficer },
    { href: "/field/recommendations", icon: <Sparkles className="h-4 w-4" />, label: o.newRecommendation },
    { href: "/field/products", icon: <FileText className="h-4 w-4" />, label: o.fillDetails },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow={fmt(o.eyebrow, { date: today })} title={o.title} description={o.subtitle} actions={<RefreshButton />} />

      <StatGrid>
        <StatCard dark icon={<IndianRupee />} label={o.todaySales} value={formatCurrency(data.todayTotal)} sub={plural(data.todayCount, o.order, o.orders)} href="/field/orders" />
        <StatCard icon={<CalendarDays />} label={o.monthSales} value={formatCurrency(data.monthTotal)} sub={plural(data.monthCount, o.order, o.orders)} href="/field/orders" />
        <StatCard
          icon={<Leaf />}
          label={o.farmers}
          value={data.farmers.toLocaleString("en-IN")}
          sub={fmt(o.farmersSub, { n: data.farmers.toLocaleString("en-IN") })}
          href="/field/farmers"
        />
        <StatCard icon={<Users />} label={o.officers} value={data.officers.toLocaleString("en-IN")} sub={fmt(o.officersSub, { n: data.officersWithAccess })} href="/field/officers" />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title={o.recentOrders}
          actions={
            <Link href="/field/orders" className="inline-flex items-center gap-1 text-xs font-semibold text-[#245B3E] hover:underline">
              {o.allOrders} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {data.recentOrders.length === 0 ? (
            <EmptyState icon={<ClipboardList />} title={o.noOrders} body={o.noOrdersBody} />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className={tableClass}>
                  <thead className={theadClass}>
                    <tr>
                      <th className={thClass}>{o.colOrder}</th>
                      <th className={thClass}>{o.colFarmer}</th>
                      <th className={thClass}>{o.colWhen}</th>
                      <th className={`${thClass} text-right`}>{o.colAmount}</th>
                      <th className={thClass}>{o.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((order) => {
                      const by = (order.operatorName ?? "").replace(/^Field · /, "");
                      return (
                        <tr key={order.id} className={trClass}>
                          <td className={tdClass}>
                            <Link href={`/invoices/${order.id}`} className="font-semibold text-[#245B3E] hover:underline">
                              {order.externalOrderId || order.invoiceNo}
                            </Link>
                            <p className="text-xs text-[#5E6B62]">{order.invoiceNo}</p>
                          </td>
                          <td className={tdClass}>
                            <p className="font-medium text-[#1E3317]">{order.customerName || "—"}</p>
                            <p className="text-xs text-[#5E6B62]">{!by || by.toLowerCase() === "farmer" ? o.byFarmer : by}</p>
                          </td>
                          <td className={`${tdClass} whitespace-nowrap text-[#5E6B62]`}>
                            {when.format(new Date(order.date))}
                            {order.placedGps ? (
                              <a
                                href={orderLocationMapsUrl(order.placedGps)}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-xs font-medium text-[#245B3E] hover:underline"
                              >
                                {o.colLocation} ↗
                              </a>
                            ) : null}
                          </td>
                          <td className={`${tdClass} text-right font-semibold tabular-nums text-[#1E3317]`}>{formatCurrency(order.grandTotal)}</td>
                          <td className={tdClass}>
                            <OrderBadge status={order.status} stage={order.stage} t={o} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden">
                {data.recentOrders.map((order) => (
                  <MobileCard key={order.id} href={`/invoices/${order.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#1E3317]">{order.customerName || "—"}</p>
                        <p className="text-xs text-[#5E6B62]">
                          {order.externalOrderId || order.invoiceNo} · {when.format(new Date(order.date))}
                        </p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="font-bold tabular-nums text-[#1E3317]">{formatCurrency(order.grandTotal)}</p>
                        <OrderBadge status={order.status} stage={order.stage} t={o} />
                      </div>
                    </div>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title={o.attention}>
            {attention.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#5E6B62]">{o.attentionEmpty}</p>
            ) : (
              <ul>
                {attention.map((item) => (
                  <li key={item.href} className="border-t border-[#1E3317]/8 first:border-t-0">
                    <Link href={item.href} className="flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-[#FAFBF7]">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.tone}`}>{item.icon}</span>
                      <span className="min-w-0 flex-1 font-medium text-[#1E3317]">{item.text}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#5E6B62]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={o.catalog}>
            <Link href="/field/catalog" className="flex items-center gap-3 px-5 py-4 hover:bg-[#FAFBF7]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EDF2E7] text-[#3E5E2F]">
                <Package className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#1E3317]">{fmt(o.skus, { n: data.skuCount.toLocaleString("en-IN") })}</span>
                <span className="block text-xs text-[#5E6B62]">{fmt(o.catalogSub, { cats: data.categories, subs: data.subcategories })}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-[#5E6B62]" />
            </Link>
          </Panel>

          <Panel title={o.quickLinks}>
            <div className="grid grid-cols-2 gap-2 p-3">
              {quick.map((q) => (
                <Link
                  key={q.label}
                  href={q.href}
                  className="flex items-center gap-2 rounded-xl border border-[#1E3317]/10 px-3 py-3 text-xs font-semibold text-[#1E3317] hover:border-[#1E3317]/25 hover:bg-[#F4F8EF]"
                >
                  <span className="shrink-0 text-[#3E5E2F]">{q.icon}</span>
                  <span className="min-w-0">{q.label}</span>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function OrderBadge({ status, stage, t }: { status: string; stage: string | null; t: { statusActive: string; statusCancelled: string } }) {
  if (status === "cancelled") return <Badge tone="red">{t.statusCancelled}</Badge>;
  if (stage === "Delivered") return <Badge tone="green">{stage}</Badge>;
  if (stage) return <Badge tone="blue">{stage}</Badge>;
  return <Badge tone="lime">{t.statusActive}</Badge>;
}
