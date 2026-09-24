"use client";

import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LabelProduct } from "@/lib/label-render";
import {
  isSerialPrintSupported,
  isUsbPrintSupported,
  printLabelsVia,
  resolveTransport,
  type Transport,
} from "@/lib/thermal-usb-print";

/**
 * Print one product's label straight from the products table.
 *
 * The wire is chosen by what the browser has already been granted, not by what
 * it merely supports. Choosing on support alone always picked USB, because
 * Chrome supports WebUSB everywhere — including Windows, where `usbprint.sys`
 * owns printer-class devices and Chrome is refused the interface whatever
 * driver is installed. That made Bluetooth unreachable on the one platform
 * that has to use it, and stranded a Mac whose printer had simply been
 * unplugged.
 *
 * So: print over whatever is already connected, and when nothing is, ask once.
 * A failure re-opens the question, which is how you switch wires after a cable
 * goes missing.
 */
const QTY_PRESETS = [1, 6, 10];

export function PrintLabelButton({
  product,
  presentDots,
}: {
  product: LabelProduct;
  /** Tear-off feed from Settings, so the label clears the tear bar. */
  presentDots?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  // Opened by the print button itself, before the transport is even
  // chosen — asking "how many" up front means one popover, not two, and
  // means the qty is already known by the time a device needs picking.
  const [qtyPromptOpen, setQtyPromptOpen] = useState(false);
  const [qty, setQty] = useState("1");

  async function print(transport: Transport) {
    setChoosing(false);
    setBusy(true);
    const count = Math.max(1, Math.round(parseFloat(qty)) || 1);
    try {
      await printLabelsVia(transport, Array(count).fill(product), { presentDots });
      setQtyPromptOpen(false);
    } catch (error) {
      // Dismissing the device chooser is a decision, not a failure.
      if (error instanceof DOMException && error.name === "NotFoundError") {
        setChoosing(true);
        return;
      }
      console.error(error);
      alert(error instanceof Error ? error.message : "Could not print the label.");
      setChoosing(true);
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (busy) return;
    if (!isUsbPrintSupported() && !isSerialPrintSupported()) {
      alert(
        "Label printing needs Google Chrome or Edge on a computer with the printer attached."
      );
      return;
    }
    const transport = await resolveTransport();
    if (transport) await print(transport);
    else setChoosing(true);
  }

  function openPrompt() {
    setQty("1");
    setChoosing(false);
    setQtyPromptOpen(true);
  }

  return (
    <span className="relative inline-flex">
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        disabled={busy}
        onClick={openPrompt}
        title="Print barcode label"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Printer className="h-3.5 w-3.5" />
        )}
      </Button>

      {qtyPromptOpen && !choosing && (
        <div className="absolute right-0 top-8 z-20 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs text-slate-600">How many labels?</p>
          <div className="mb-2 flex gap-1.5">
            {QTY_PRESETS.map((n) => (
              <Button
                key={n}
                size="sm"
                variant={qty === String(n) ? "default" : "outline"}
                className="h-7 flex-1 px-0"
                onClick={() => setQty(String(n))}
              >
                {n}
              </Button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePrint()}
            className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1" disabled={busy} onClick={handlePrint}>
              {busy ? "Printing…" : "Print"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setQtyPromptOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {choosing && (
        <div className="absolute right-0 top-8 z-20 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs text-slate-600">
            Connect the printer. Bluetooth is the only option on Windows.
          </p>
          <div className="flex flex-col gap-1.5">
            {isUsbPrintSupported() && (
              <Button size="sm" variant="outline" onClick={() => print("usb")}>
                Connect over USB
              </Button>
            )}
            {isSerialPrintSupported() && (
              <Button size="sm" variant="outline" onClick={() => print("bluetooth")}>
                Connect over Bluetooth
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </span>
  );
}
