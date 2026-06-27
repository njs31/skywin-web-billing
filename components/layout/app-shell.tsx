"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 flex-col md:flex-row">
      {/* Mobile Top Navigation */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <span className="font-bold text-slate-800 tracking-wide text-xs">
          SKYWIN AGRI SUPER MARKET
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-slate-600"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Responsive Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto">{children}</main>
    </div>
  );
}
