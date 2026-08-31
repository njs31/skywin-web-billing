"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  downloadLabelPng,
  downloadLabelPngFiles,
  productCode,
  renderLabelPngMap,
  type LabelProduct,
} from "@/lib/label-render";
import { DRIVER_PAGE_H_MM, DRIVER_PAGE_W_MM } from "@/lib/label-print-config";
import {
  isSerialPrintSupported,
  isUsbPrintSupported,
  printLabelsViaSerial,
  printLabelsViaUsb,
} from "@/lib/thermal-usb-print";

export type { LabelProduct };

/**
 * Tell the browser the page is one sticker, not A4 — otherwise a driver print
 * lays the label on A4 and the printer spits blank stock between every one.
 * The size is the printable window rather than the full sticker; see
 * DRIVER_PAGE_W_MM. The custom properties keep the print stylesheet on the
 * same numbers.
 */
const PAGE_RULE = `
  @page { size: ${DRIVER_PAGE_W_MM}mm ${DRIVER_PAGE_H_MM}mm; margin: 0; }
  :root {
    --label-print-w: ${DRIVER_PAGE_W_MM}mm;
    --label-print-h: ${DRIVER_PAGE_H_MM}mm;
  }
`;

/** Browser capabilities never change mid-session, so there is nothing to watch. */
const subscribeNever = () => () => {};
const returnFalse = () => false;

function LabelPreview({
  product,
  previewSrc,
  ready,
}: {
  product: LabelProduct;
  previewSrc: string;
  ready: boolean;
}) {
  if (previewSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={previewSrc}
        alt={`Label for ${product.name}`}
        className="thermal-label-preview-img"
        draggable={false}
      />
    );
  }

  return (
    <div className="thermal-label thermal-label-loading">
      <p className="text-[8px] text-slate-500">
        {ready ? "Preview unavailable" : "Preparing label…"}
      </p>
    </div>
  );
}

export function ProductLabelSheet({ products }: { products: LabelProduct[] }) {
  const [labelPngMap, setLabelPngMap] = useState<Record<number, string>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"" | "usb" | "serial">("");
  const [copies, setCopies] = useState(1);

  /**
   * Both checks read `navigator`, which does not exist while Next renders this
   * on the server. Calling them during render returned false there and true in
   * the browser, so the two HTML trees disagreed and React threw the tree away
   * — which detaches the toolbar's click handlers until it has re-rendered,
   * and a click in that window does nothing. useSyncExternalStore lets us
   * declare the server answer explicitly and adopt the real one after
   * hydration.
   */
  const usbSupported = useSyncExternalStore(
    subscribeNever,
    isUsbPrintSupported,
    returnFalse
  );
  const serialSupported = useSyncExternalStore(
    subscribeNever,
    isSerialPrintSupported,
    returnFalse
  );

  useEffect(() => {
    document.body.classList.add("thermal-label-page");
    const style = document.createElement("style");
    style.textContent = PAGE_RULE;
    document.head.appendChild(style);
    return () => {
      document.body.classList.remove("thermal-label-page");
      style.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const map = await renderLabelPngMap(products);
        if (!cancelled) {
          setLabelPngMap(map);
          setReady(true);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLabelPngMap({});
          setReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [products]);

  const qty = Math.max(1, Math.min(99, copies));
  const labelCount = products.length * qty;

  /** One entry per physical sticker, so a driver print honours "copies each". */
  const printSheet = useMemo(() => {
    const out: { key: string; src: string; alt: string }[] = [];
    for (const product of products) {
      const src = labelPngMap[product.id];
      if (!src) continue;
      for (let i = 0; i < qty; i++) {
        out.push({ key: `${product.id}-${i}`, src, alt: product.name });
      }
    }
    return out;
  }, [products, labelPngMap, qty]);

  function reportError(error: unknown, fallback: string) {
    // The user dismissed the Chrome device chooser; not an error.
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    console.error(error);
    alert(error instanceof Error ? error.message : fallback);
  }

  async function handleUsbPrint() {
    if (!ready || busy) return;
    setBusy("usb");
    try {
      await printLabelsViaUsb(products, { copies });
    } catch (error) {
      reportError(error, "USB print failed. Check the cable and try again.");
    } finally {
      setBusy("");
    }
  }

  async function handleSerialPrint() {
    if (!ready || busy) return;
    setBusy("serial");
    try {
      await printLabelsViaSerial(products, { copies });
    } catch (error) {
      reportError(
        error,
        "Serial print failed. Pair the printer over Bluetooth first, then pick its COM port."
      );
    } finally {
      setBusy("");
    }
  }

  async function handleDownloadOne(product: LabelProduct) {
    try {
      const cached = labelPngMap[product.id];
      if (cached) {
        const link = document.createElement("a");
        link.href = cached;
        link.download = `label-${productCode(product)}.png`;
        link.click();
        return;
      }
      await downloadLabelPng(product);
    } catch (error) {
      reportError(error, "Could not download label image.");
    }
  }

  if (products.length === 0) {
    return (
      <p className="p-6 text-sm text-slate-500">
        No products selected for label printing.
      </p>
    );
  }

  return (
    <div className="label-print-root">
      <div className="label-toolbar">
        <button
          type="button"
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={!ready}
          onClick={() => window.print()}
          title="Prints through the POS58 queue installed on this computer"
        >
          Print {labelCount} label{labelCount === 1 ? "" : "s"}
        </button>

        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Copies each
          <input
            type="number"
            min={1}
            max={99}
            value={copies}
            onChange={(e) =>
              setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))
            }
            className="h-8 w-14 rounded border border-slate-300 px-2 text-sm"
          />
        </label>

        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:opacity-50"
          disabled={!ready}
          onClick={() => downloadLabelPngFiles(products, labelPngMap, copies)}
        >
          {ready ? "Download PNG" : "Preparing label…"}
        </button>

        <details className="w-full text-xs text-slate-700">
          <summary className="cursor-pointer select-none py-1 font-medium">
            Print without a driver
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-3">
            {usbSupported && (
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                disabled={!ready || busy !== ""}
                onClick={handleUsbPrint}
              >
                {busy === "usb" ? "Sending…" : "Print over USB"}
              </button>
            )}

            {serialSupported && (
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                disabled={!ready || busy !== ""}
                onClick={handleSerialPrint}
                title="Pair the printer over Bluetooth, then pick its cu.* port"
              >
                {busy === "serial" ? "Sending…" : "Print over Bluetooth"}
              </button>
            )}

            <p className="w-full text-slate-600">
              These send the printer&apos;s own ESC/POS bytes and need no driver
              installed. Use them on a machine where the POS58 queue is not set
              up. On a Mac, remove the POS58 queue first — the system print
              service holds the USB port and the browser cannot claim it. Over
              Bluetooth, pick the <strong>cu.</strong> entry, not the bare name.
            </p>
          </div>
        </details>

        <p className="w-full text-xs text-slate-600">
          <strong>{labelCount}</strong> label{labelCount === 1 ? "" : "s"} ·{" "}
          {DRIVER_PAGE_W_MM} × {DRIVER_PAGE_H_MM} mm. <strong>Print</strong>{" "}
          uses the <strong>POS58</strong> printer queue — pick it in the dialog,
          with paper size {DRIVER_PAGE_W_MM} × {DRIVER_PAGE_H_MM} mm. Any other
          queue (POS80, CLA58) prints pages of code or nothing at all.
        </p>
      </div>

      <div className="label-print-sheet" aria-hidden="true">
        {printSheet.map((label) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={label.key} src={label.src} alt={label.alt} />
        ))}
      </div>

      <div className="thermal-label-preview-grid">
        {products.map((product) => (
          <div key={product.id} className="flex flex-col items-start gap-2">
            <LabelPreview
              product={product}
              previewSrc={labelPngMap[product.id] || ""}
              ready={ready}
            />
            <button
              type="button"
              className="thermal-label-actions text-xs text-emerald-700 underline"
              onClick={() => handleDownloadOne(product)}
              disabled={!labelPngMap[product.id]}
            >
              Download this PNG
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
