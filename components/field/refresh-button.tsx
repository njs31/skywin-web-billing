"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="h-8 rounded-md border border-[#1E3317]/15 bg-white px-3 text-xs font-medium text-[#29332C] hover:bg-[#F4F3EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3317] disabled:opacity-60"
    >
      {pending ? "Refreshing" : "Refresh"}
    </button>
  );
}
