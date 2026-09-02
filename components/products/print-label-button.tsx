"use client";

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LabelProduct } from "@/lib/label-render";
import {
  isSerialPrintSupported,
  isUsbPrintSupported,
  printLabelsViaSerial,
  printLabelsViaUsb,
} from "@/lib/thermal-usb-print";

/**
 * Print one product's label straight from the products table.
 *
 * This replaces a link to a separate label page. The label was never rendered
 * by that page for the printer's benefit — the bytes are built in the browser
 * either way — so the page was a detour: open a tab, wait for a preview, press
 * a button, close the tab, for one sticker.
 *
 * USB first, Bluetooth if the browser has no WebUSB. The first print raises
 * Chrome's device chooser; after that the grant is remembered and a click goes
 * straight to the printer.
 */
export function PrintLabelButton({
  product,
  presentDots,
}: {
  product: LabelProduct;
  /** Tear-off feed from Settings, so the label clears the tear bar. */
  presentDots?: number;
}) {
  const [busy, setBusy] = useState(false);

  async function handlePrint() {
    if (busy) return;
    setBusy(true);
    try {
      if (isUsbPrintSupported()) {
        await printLabelsViaUsb([product], { presentDots });
      } else if (isSerialPrintSupported()) {
        await printLabelsViaSerial([product], { presentDots });
      } else {
        throw new Error(
          "Label printing needs Google Chrome or Edge on a computer with the printer attached."
        );
      }
    } catch (error) {
      // Dismissing the device chooser is a decision, not a failure.
      if (error instanceof DOMException && error.name === "NotFoundError") return;
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not print the label.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      disabled={busy}
      onClick={handlePrint}
      title="Print barcode label"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Printer className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
