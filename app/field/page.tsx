import Link from "next/link";
import { fieldOverview } from "@/lib/actions/field";
import { formatCurrency } from "@/lib/utils";

export default async function FieldOverviewPage() {
  const data = await fieldOverview();

  const cards = [
    { label: "Categories", value: String(data.categories), href: "/field/catalog", sub: `${data.subcategories} subcategories` },
    { label: "Mapped SKUs", value: String(data.skuCount), href: "/field/catalog", sub: "pinned to rails" },
    { label: "Pending farmers", value: String(data.pendingFarmers), href: "/field/farmers?approval=pending", sub: "need approval" },
    { label: "Today field UPI", value: formatCurrency(data.todayTotal), href: "/field/orders", sub: `${data.todayCount} orders today` },
    { label: "This month", value: formatCurrency(data.monthTotal), href: "/field/orders", sub: `${data.monthCount} invoices` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SkyWin Field</h1>
        <p className="text-sm text-[#2E4A22]/70">
          Manage the phone app catalog, farmers, officers, and live field invoices.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-2xl border border-[#1E3317]/10 bg-white p-4 shadow-sm hover:border-[#B8D94A]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[#2E4A22]/60">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-[#1E3317]">{card.value}</p>
            <p className="text-xs text-[#2E4A22]/60">{card.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
