"use client";

import { useEffect } from "react";
import { getStoredPrintSize, triggerPrint } from "@/lib/print-size";

/** Kept for any remaining auto-print callers; prefers stored paper size. */
export function AutoPrint({ autoPrint }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = setTimeout(() => triggerPrint(getStoredPrintSize()), 500);
    return () => clearTimeout(timer);
  }, [autoPrint]);

  return null;
}
