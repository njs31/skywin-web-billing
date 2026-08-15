"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { NavigationSpinner } from "./navigation-spinner";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUSINESS } from "@/lib/business";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  if (pathname === "/login") {
    return <main className="h-screen w-screen overflow-auto bg-[#050605]">{children}</main>;
  }

  // Bare shell for label printer pages — no sidebar/header chrome in print preview.
  if (pathname.startsWith("/products/labels")) {
    return <main className="label-print-shell min-h-screen w-screen bg-white">{children}</main>;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 flex-col md:flex-row">
      <header className="no-print flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image
            src="/logo.avif"
            alt={BUSINESS.name}
            width={28}
            height={28}
            className="h-7 w-7 shrink-0"
          />
          <span className="truncate text-xs font-bold tracking-wide text-slate-800">
            {BUSINESS.tagline}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-slate-600"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="relative min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={null}>
          <NavigationSpinner />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
