"use client";

import { useEffect } from "react";
import {
  resolvePrintSize,
  triggerPrint,
  type PrintSize,
} from "@/lib/print-size";
import { PrintSizeMenu } from "@/components/invoice/print-size-menu";

type PrintButtonProps = {
  autoPrint?: boolean;
  /** From ?size=A5 query when opening with auto-print */
  initialSize?: string;
  buttonText?: string;
};

export function PrintButton({
  autoPrint,
  initialSize,
  buttonText = "Print Invoice",
}: PrintButtonProps) {
  useEffect(() => {
    if (!autoPrint) return;
    const size: PrintSize = resolvePrintSize(initialSize);
    const timer = setTimeout(() => triggerPrint(size), 500);
    return () => clearTimeout(timer);
  }, [autoPrint, initialSize]);

  return (
    <PrintSizeMenu mode="print" label={buttonText} size="default" />
  );
}
