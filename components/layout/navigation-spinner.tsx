"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Shows a circular spinner overlay as soon as an internal link is clicked,
 * until the destination route finishes rendering (pathname/search changes).
 * Complements route `loading.tsx` which can be too brief to notice.
 */
export function NavigationSpinner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  // Hide when navigation completes
  useEffect(() => {
    setPending(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const nextPath = url.pathname;
      const nextSearch = url.search;
      const currentSearch = window.location.search;
      if (nextPath === pathname && nextSearch === currentSearch) return;

      setPending(true);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // Safety timeout so spinner never sticks forever
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 12000);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-slate-50/70 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-8 py-6 shadow-lg">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-sm font-medium text-slate-600">Loading…</p>
      </div>
    </div>
  );
}
