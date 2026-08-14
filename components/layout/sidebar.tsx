"use client";

import Link from "next/link";
import Image from "next/image";
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
  Smartphone,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS } from "@/lib/business";
import { useState, useEffect } from "react";

const PURCHASE_ROUTES = ["/purchases", "/suppliers"];

function isPurchaseNavItem(href: string) {
  return PURCHASE_ROUTES.some(
    (path) => href === path || href.startsWith(`${path}/`)
  );
}

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
      { href: "/purchase-orders", label: "Purchase Orders", icon: FileText },
      { href: "/quotations", label: "Quotations", icon: FileText },
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
    items: [
      { href: "/users", label: "User Management", icon: Users },
      { href: "/widget", label: "Phone widget", icon: Smartphone },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const allNavHrefs = navGroups.flatMap((g) => g.items.map((i) => i.href));

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;

  return !allNavHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`))
  );
}

export function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [currentUser, setCurrentUser] = useState<any>({
    role: "admin",
    name: "Administrator",
  });

  useEffect(() => {
    import("@/lib/actions/auth").then(({ getCurrentUser }) => {
      getCurrentUser().then((user) => {
        setCurrentUser(user);
      });
    });
  }, []);

  const filteredNavGroups = navGroups
    .map((group) => {
      const items = group.items.filter((item) => {
        const role = currentUser?.role || "admin";

        if (role === "admin") return true;

        if (role === "regional_manager" || role === "sales_officer") {
          if (item.href === "/users" || item.href === "/settings" || item.href === "/widget") return false;
          if (role === "sales_officer" && isPurchaseNavItem(item.href)) {
            return false;
          }
          return true;
        }

        if (role === "dealer") {
          return (
            item.href === "/" ||
            item.href === "/pos" ||
            item.href === "/invoices" ||
            item.href === "/accounts/outstanding"
          );
        }

        return false;
      });

      return { ...group, items };
    })
    .filter((g) => g.items.length > 0);

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/50 transition-opacity md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar Container */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 transform flex-col bg-slate-900 text-white transition-transform duration-200 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="border-b border-slate-800 p-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/logo.avif"
              alt={BUSINESS.name}
              width={40}
              height={40}
              className="h-10 w-10 shrink-0"
              priority
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#b4d12a]">
                {BUSINESS.name}
              </p>
              <h1 className="truncate text-sm font-bold leading-tight">
                {BUSINESS.tagline}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto sidebar-scrollbar p-3">
          {filteredNavGroups.map((group) => {
            const isOpenGroup = collapsed[group.label] !== true;
            return (
              <div key={group.label} className="mb-2">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((p) => ({
                      ...p,
                      [group.label]: isOpenGroup ? true : false,
                    }))
                  }
                  className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
                >
                  {group.label}
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      !isOpenGroup && "-rotate-90"
                    )}
                  />
                </button>
                {isOpenGroup && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isNavActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
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
        <div className="border-t border-slate-800 px-3 py-2.5 space-y-2">
          {currentUser && (
            <div className="flex flex-col gap-0.5 text-xs">
              <span className="font-semibold text-slate-200 truncate">{currentUser.name}</span>
              <span className="text-[10px] text-emerald-400 font-medium capitalize tracking-wide">
                Role: {currentUser.role.replace("_", " ")}
              </span>
              <span className="text-[10px] text-slate-400">{currentUser.phone}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-slate-800/60 pt-2">
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider truncate">
              GSTIN: {BUSINESS.gstin}
            </span>
            <button
              onClick={async () => {
                const { logout } = await import("@/lib/actions/auth");
                await logout();
                window.location.href = "/login";
              }}
              className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 transition-colors uppercase tracking-wider cursor-pointer"
            >
              Logout
            </button>
          </div>
          <div className="flex w-full justify-center border-t border-slate-800/60 pt-2">
            <a
              href="https://qwicksapp.com"
              target="_blank"
              rel="noopener noreferrer"
              title="Powered by Qwicksapp"
              className="inline-flex justify-center"
            >
              {/* Plain img avoids Next/Image cache serving an old asset */}
              <img
                src="/poweredby.png?v=3"
                alt="Powered by Qwicksapp"
                width={168}
                height={56}
                className="h-9 w-auto max-w-[180px] object-contain"
              />
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
