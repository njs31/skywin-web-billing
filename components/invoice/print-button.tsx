"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import {
  DEFAULT_PRINT_SIZE,
  PRINT_SIZES,
  getStoredPrintSize,
  setStoredPrintSize,
  triggerPrint,
  type PrintSize,
} from "@/lib/print-size";

type PrintButtonProps = {
  autoPrint?: boolean;
  invoiceNo?: string;
  grandTotal?: string;
  phone?: string;
  documentType?: string;
  buttonText?: string;
  showWhatsApp?: boolean;
};

export function PrintButton({
  autoPrint,
  invoiceNo,
  grandTotal,
  phone,
  documentType = "Invoice",
  buttonText = "Print Invoice",
  showWhatsApp = true,
}: PrintButtonProps) {
  const [printSize, setPrintSize] = useState<PrintSize>(DEFAULT_PRINT_SIZE);

  useEffect(() => {
    setPrintSize(getStoredPrintSize());
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const timer = setTimeout(() => triggerPrint(printSize), 500);
    return () => clearTimeout(timer);
  }, [autoPrint, printSize]);

  const onSizeChange = (size: PrintSize) => {
    setPrintSize(size);
    setStoredPrintSize(size);
    document.documentElement.dataset.printSize = size;
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `${documentType} ${invoiceNo ?? ""} from SKYWIN AGRI SUPER MARKET. Total: ₹${grandTotal ?? ""}. Thank you!`
    );
    const url = phone
      ? `https://wa.me/91${phone.replace(/\D/g, "")}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <span className="whitespace-nowrap">Paper</span>
        <select
          value={printSize}
          onChange={(e) => onSizeChange(e.target.value as PrintSize)}
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label="Print paper size"
        >
          {PRINT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      {showWhatsApp ? (
        <Button variant="outline" onClick={shareWhatsApp}>
          <MessageCircle className="mr-2 h-4 w-4" />
          WhatsApp
        </Button>
      ) : null}
      <Button onClick={() => triggerPrint(printSize)}>{buttonText}</Button>
    </div>
  );
}
