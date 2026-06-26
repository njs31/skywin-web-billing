import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  FileText,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS } from "@/lib/business";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS Billing", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Package },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/purchases", label: "Purchases", icon: FileText },
  { href: "/invoices", label: "Invoices", icon: Receipt },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-slate-900 text-white">
      <div className="border-b border-slate-800 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          {BUSINESS.name}
        </p>
        <h1 className="mt-1 text-lg font-bold">{BUSINESS.tagline}</h1>
        <p className="mt-2 text-xs text-slate-400">POS Billing System</p>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-4 text-xs text-slate-500">
        GSTIN: {BUSINESS.gstin}
      </div>
    </aside>
  );
}
