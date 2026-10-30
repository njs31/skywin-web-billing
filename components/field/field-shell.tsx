"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Leaf,
  Menu,
  Package,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/field", label: "Overview", icon: LayoutDashboard },
  { href: "/field/catalog", label: "Catalog", icon: Package },
  { href: "/field/products", label: "Product details", icon: FileText },
  { href: "/field/farmers", label: "Farmers", icon: Leaf },
  { href: "/field/officers", label: "Officers", icon: Users },
  { href: "/field/orders", label: "Orders", icon: ClipboardList },
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
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F4F3EE] text-[#29332C]">
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[#1E3317]/10 bg-[#1E3317] px-4 text-white md:hidden">
        <button
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A]"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <Image src="/logo.avif" alt="" width={28} height={28} className="h-7 w-7" />
        <p className="text-sm font-semibold tracking-wide">SkyWin Field</p>
      </header>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[#1E3317]/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col bg-[#1E3317] text-white transition-transform md:static md:inset-auto md:z-auto md:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
            <Image
              src="/logo.avif"
              alt="SkyWin"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0"
              priority
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C6E26A]">
                SkyWin Field
              </p>
              <p className="truncate text-sm text-white/80">Admin</p>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 p-2" aria-label="Field admin">
            {NAV.map((item) => {
              const Icon = item.icon;
              const on = active(pathname, item.href);
              const className = cn(
                "flex h-10 items-center gap-2.5 rounded-md px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A]",
                on
                  ? "bg-white/10 font-medium text-white shadow-[inset_3px_0_0_#C6E26A]"
                  : "text-white/75 hover:bg-white/5 hover:text-white"
              );
              const icon = <Icon className="h-4 w-4 shrink-0" aria-hidden />;
              // Next 16.2 leaves this dynamic route on the loading shell after a
              // client click. A normal link loads it the same way the address bar does.
              if (item.href === "/field/products") {
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    aria-current={on ? "page" : undefined}
                    className={className}
                  >
                    {icon}
                    {item.label}
                  </a>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  aria-current={on ? "page" : undefined}
                  className={className}
                >
                  {icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-2">
            <Link
              href={billingHref}
              onClick={close}
              className="flex h-10 items-center gap-2.5 rounded-md px-3 text-sm text-white/75 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A]"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
              Back to billing
            </Link>
          </div>
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
