"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOutEverywhere } from "@/lib/sso-client";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Package,
  Sparkles,
  UserX,
  Users,
  X,
  Megaphone, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldText } from "@/lib/field-i18n";
import { LangToggle, useFieldText } from "@/components/field/lang";

type NavItem = { href: string; key: keyof FieldText["nav"]; icon: typeof LayoutDashboard };

const NAV: NavItem[] = [
  { href: "/field", key: "overview", icon: LayoutDashboard },
  { href: "/field/catalog", key: "catalog", icon: Package },
  { href: "/field/banners", key: "banners", icon: Images },
  { href: "/field/products", key: "products", icon: FileText },
  { href: "/field/farmers", key: "farmers", icon: Leaf },
  { href: "/field/recommendations", key: "recommendations", icon: Sparkles },
  { href: "/field/officers", key: "officers", icon: Users },
  { href: "/field/orders", key: "orders", icon: ClipboardList },
  { href: "/field/notifications", key: "notifications", icon: Megaphone },
  { href: "/field/deletions", key: "deletions", icon: UserX },
];
const TEAM_NAV: NavItem[] = [{ href: "/field/team", key: "team", icon: Users }];
const OFFICER_NAV: NavItem[] = [{ href: "/field/recommendations", key: "recommendations", icon: Sparkles }];

function active(pathname: string, href: string) {
  if (href === "/field") return pathname === "/field";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Field dashboard frame. Phones: top bar + slide-in menu. Tablets (md): a compact icon rail.
 * Desktops (lg+): the full sidebar. The language switch is in every layout.
 */
export function FieldShell({
  children,
  billingHref = "/",
  teamOnly = false,
  recommendationsOnly = false,
  userName = "",
}: {
  children: React.ReactNode;
  billingHref?: string;
  teamOnly?: boolean;
  recommendationsOnly?: boolean;
  userName?: string;
}) {
  const t = useFieldText();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const nav = teamOnly ? TEAM_NAV : recommendationsOnly ? OFFICER_NAV : NAV;
  const signOutOnly = teamOnly || recommendationsOnly;
  const role = teamOnly ? t.nav.salesOfficer : recommendationsOnly ? t.nav.fieldOfficer : t.nav.admin;

  // Close the phone menu on navigation (adjusting state while rendering) and with Escape.
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const navLinks = (compact: boolean) =>
    nav.map((item) => {
      const Icon = item.icon;
      const on = active(pathname, item.href);
      const label = t.nav[item.key];
      const className = cn(
        "group relative flex items-center rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A]",
        compact ? "h-11 w-11 justify-center" : "h-11 gap-3 px-3",
        on ? "bg-white/12 font-semibold text-white" : "text-white/70 hover:bg-white/6 hover:text-white"
      );
      const content = (
        <>
          {on ? <span aria-hidden className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-[#C6E26A]" /> : null}
          <Icon className={cn("h-[18px] w-[18px] shrink-0", on ? "text-[#C6E26A]" : "")} aria-hidden />
          {compact ? (
            <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg bg-[#1E3317] px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block group-focus-visible:block">
              {label}
            </span>
          ) : (
            <span className="truncate">{label}</span>
          )}
        </>
      );
      // Next 16.2 leaves this dynamic route on the loading shell after a client click;
      // a normal link loads it the same way the address bar does.
      if (item.href === "/field/products") {
        return (
          <a key={item.href} href={item.href} onClick={close} aria-current={on ? "page" : undefined} aria-label={compact ? label : undefined} className={className}>
            {content}
          </a>
        );
      }
      return (
        <Link key={item.href} href={item.href} onClick={close} aria-current={on ? "page" : undefined} aria-label={compact ? label : undefined} className={className}>
          {content}
        </Link>
      );
    });

  const footer = (compact: boolean) => {
    const cls = cn(
      "flex items-center rounded-xl text-sm text-white/70 transition-colors hover:bg-white/6 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A]",
      compact ? "h-11 w-11 justify-center" : "h-11 w-full gap-3 px-3"
    );
    return signOutOnly ? (
      <button
        type="button"
        onClick={() => {
          close();
          void signOutEverywhere();
        }}
        aria-label={compact ? t.nav.signOut : undefined}
        title={compact ? t.nav.signOut : undefined}
        className={cls}
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
        {compact ? null : t.nav.signOut}
      </button>
    ) : (
      <Link href={billingHref} onClick={close} aria-label={compact ? t.nav.backToBilling : undefined} title={compact ? t.nav.backToBilling : undefined} className={cls}>
        <ArrowLeft className="h-[18px] w-[18px] shrink-0" aria-hidden />
        {compact ? null : t.nav.backToBilling}
      </Link>
    );
  };

  const brand = (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/8">
        <Image src="/logo.avif" alt="SkyWin" width={28} height={28} className="h-7 w-7" priority />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#C6E26A]">{t.nav.brand}</p>
        <p className="truncate text-sm text-white/85">{userName || role}</p>
        {userName ? <p className="truncate text-[11px] text-white/55">{role}</p> : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F4F3EE] text-[#29332C]">
      {/* Phone top bar */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 bg-[#1E3317] px-3 text-white md:hidden">
        <button
          type="button"
          aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6E26A]"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Image src="/logo.avif" alt="" width={26} height={26} className="h-6 w-6" />
        <p className="flex-1 truncate text-sm font-semibold">{t.nav.brand}</p>
        <LangToggle />
      </header>

      {open ? <button type="button" aria-label={t.nav.closeMenu} className="fixed inset-0 z-30 bg-[#0F1A0C]/50 md:hidden" onClick={close} /> : null}

      <div className="flex min-h-0 flex-1">
        {/* Phone drawer */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-[#1E3317] text-white shadow-2xl transition-transform duration-200 md:hidden",
            open ? "translate-x-0" : "-translate-x-full"
          )}
          inert={!open}
        >
          <div className="border-b border-white/10 px-4 py-4">{brand}</div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label={t.nav.brand}>
            {navLinks(false)}
          </nav>
          <div className="space-y-2 border-t border-white/10 p-3">{footer(false)}</div>
        </aside>

        {/* Tablet rail */}
        <aside className="hidden w-[76px] shrink-0 flex-col items-center bg-[#1E3317] py-4 text-white md:flex lg:hidden">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/8">
            <Image src="/logo.avif" alt="SkyWin" width={28} height={28} className="h-7 w-7" />
          </span>
          <nav className="mt-5 flex flex-1 flex-col items-center gap-1.5" aria-label={t.nav.brand}>
            {navLinks(true)}
          </nav>
          <div className="flex flex-col items-center gap-2">{footer(true)}</div>
        </aside>

        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col bg-[#1E3317] text-white lg:flex">
          <div className="border-b border-white/10 px-4 py-5">{brand}</div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label={t.nav.brand}>
            {navLinks(false)}
          </nav>
          <div className="space-y-3 border-t border-white/10 p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{t.nav.language}</span>
              <LangToggle />
            </div>
            {footer(false)}
          </div>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {/* Tablet language switch (the rail has no room for it) */}
          <div className="hidden justify-end px-6 pt-4 md:flex lg:hidden">
            <LangToggle tone="light" />
          </div>
          <div className="px-4 py-6 sm:px-6 md:pt-3 lg:px-10 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
