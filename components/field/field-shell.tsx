"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Leaf,
  Package,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/field", label: "Overview", icon: LayoutDashboard },
  { href: "/field/catalog", label: "Catalog", icon: Package },
  { href: "/field/products", label: "Product details", icon: FileText },
  { href: "/field/farmers", label: "Farmers", icon: Leaf },
  { href: "/field/officers", label: "Officers", icon: Users },
  { href: "/field/orders", label: "Field orders", icon: ClipboardList },
];

function active(pathname: string, href: string) {
  if (href === "/field") return pathname === "/field";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FieldShell({
  children,
  billingHref = "/",
}: {
  children: React.ReactNode;
  billingHref?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#FFF7F5] text-[#1E3317]">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-[#1E3317] text-white">
        <div className="border-b border-white/10 px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B8D94A]">
            SkyWin Field
          </p>
          <h1 className="mt-1 text-base font-bold">Admin dashboard</h1>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = active(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                  on ? "bg-[#B8D94A] text-[#1E3317]" : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link
            href={billingHref}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to billing
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
