"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LabelProduct } from "@/lib/label-render";
import {
  isSerialPrintSupported,
  isUsbPrintSupported,
  printCopiesVia,
  resolveTransport,
  type Transport,
} from "@/lib/thermal-usb-print";
import { printLabelViaTspl } from "@/lib/tspl-print";
import { getPrinterLanguage } from "@/lib/printer-language";

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

/**
 * Renders its children into document.body at a fixed position anchored to
 * `anchorRef`, instead of as a normally-positioned absolute child. The
 * products table wraps its rows in an `overflow-auto` scroll container
 * (components/ui/table.tsx) — an absolutely-positioned popover is clipped
 * to that box, so on any row not near the top it was rendering mostly (or
 * entirely) off the visible area. Escaping to a portal + fixed coordinates
 * is the only way out of an ancestor's overflow clipping.
 */
function FloatingPanel({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const PANEL_WIDTH = 224; // w-56
    const MARGIN = 8;
    function place() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = Math.min(
        Math.max(MARGIN, rect.right - PANEL_WIDTH),
        window.innerWidth - PANEL_WIDTH - MARGIN
      );
      // Flip above the button when there isn't room below, so it never
      // renders partly off the bottom of the viewport either.
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow > 220 || spaceBelow > rect.top
          ? rect.bottom + 4
          : Math.max(MARGIN, rect.top - 4 - (panelRef.current?.offsetHeight ?? 200));
      setPos({ top, left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [anchorRef, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-50 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body
  );
}

export function PrintLabelButton({
  product,
  presentDots,
}: {
  product: LabelProduct;
  /** Tear-off feed from Settings, so the label clears the tear bar. */
  presentDots?: number;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
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
      if (getPrinterLanguage() === "tspl") {
        // One TSPL job, the printer's own PRINT 1,N repeat — see
        // tspl-print.ts for why this needs none of the P58D's per-copy
        // pacing/looping at all.
        await printLabelViaTspl(transport, product, count);
      } else {
        await printCopiesVia(transport, product, count, { presentDots });
      }
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

  function closeAll() {
    setQtyPromptOpen(false);
    setChoosing(false);
  }

  return (
    <span className="relative inline-flex">
      <Button
        ref={buttonRef}
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
        <FloatingPanel anchorRef={buttonRef} onClose={closeAll}>
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
        </FloatingPanel>
      )}

      {choosing && (
        <FloatingPanel anchorRef={buttonRef} onClose={closeAll}>
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
        </FloatingPanel>
      )}
    </span>
  );
}
