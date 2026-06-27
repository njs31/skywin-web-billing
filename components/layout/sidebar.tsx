"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  FileText,
  Receipt,
  Users,
  RotateCcw,
  Warehouse,
  Wallet,
  BarChart3,
  Settings,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS } from "@/lib/business";
import { useState } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pos", label: "POS Billing", icon: ShoppingCart },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/invoices", label: "Sale Book", icon: Receipt },
      { href: "/returns", label: "Sales Return", icon: RotateCcw },
      { href: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Purchase",
    items: [
      { href: "/purchases", label: "Purchase Book", icon: FileText },
      { href: "/purchases/new", label: "Purchase Entry", icon: FileText },
      { href: "/suppliers", label: "Suppliers", icon: Truck },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/stock", label: "Stock Status", icon: Warehouse },
      { href: "/stock/import", label: "Stock Import", icon: Warehouse },
      { href: "/stock/expiry", label: "Near Expiry", icon: Warehouse },
    ],
  },
  {
    label: "Accounts",
    items: [
      { href: "/accounts/receipts", label: "Receipts", icon: Wallet },
      { href: "/accounts/payments", label: "Payments", icon: Wallet },
      { href: "/accounts/outstanding", label: "Outstanding", icon: Wallet },
    ],
  },
  {
    label: "Reports",
    items: [{ href: "/reports", label: "All Reports", icon: BarChart3 }],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

const allNavHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href));

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;

  // Prefer the longest matching href so /purchases/new doesn't also highlight /purchases
  return !allNavHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`))
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-white">
      <div className="border-b border-slate-800 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          {BUSINESS.name}
        </p>
        <h1 className="mt-1 text-base font-bold leading-tight">
          {BUSINESS.tagline}
        </h1>
        <p className="mt-1 text-xs text-slate-400">Billing Software</p>
      </div>
      <nav className="flex-1 overflow-y-auto sidebar-scrollbar p-3">
        {navGroups.map((group) => {
          const isOpen = collapsed[group.label] !== true;
          return (
            <div key={group.label} className="mb-2">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((p) => ({
                    ...p,
                    [group.label]: isOpen ? false : true,
                  }))
                }
                className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
              >
                {group.label}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    !isOpen && "-rotate-90"
                  )}
                />
              </button>
              {isOpen && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isNavActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-emerald-600 text-white"
                            : "text-slate-300 hover:bg-slate-800 hover:text-white"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-3 text-xs text-slate-500">
        GSTIN: {BUSINESS.gstin}
      </div>
    </aside>
  );
}
