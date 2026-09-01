"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  downloadLabelPng,
  downloadLabelPngFiles,
  productCode,
  renderLabelPngMap,
  type LabelProduct,
} from "@/lib/label-render";
import { THERMAL_LABEL_SIZE_LABEL } from "@/lib/label-print-config";
import {
  forgetSerialPrinter,
  getPrinterAccess,
  isSerialPrintSupported,
  isUsbPrintSupported,
  printLabelsViaSerial,
  printLabelsViaUsb,
  printTestLabelViaSerial,
  printTestLabelViaUsb,
  type PrinterAccess,
} from "@/lib/thermal-usb-print";

export type { LabelProduct };

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

/**
 * What the browser can reach. "Paired" means a grant exists, so a print will
 * not raise a chooser — it is not a claim that the printer is switched on,
 * which nothing short of opening the device can tell us.
 */
function PrinterStatus({
  access,
}: {
  access: PrinterAccess | null;
}) {
  if (!access) return null;

  const { usbSupported, serialSupported, usbPaired, serialPaired } = access;
  if (!usbSupported && !serialSupported) {
    return (
      <p className="w-full rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        This browser cannot reach the printer. Open the page in{" "}
        <strong>Chrome or Edge</strong> on a computer, or print from the Android
        app.
      </p>
    );
  }

  const paired = [usbPaired && "USB", serialPaired && "Bluetooth"].filter(
    Boolean
  );
  return (
    <p className="flex items-center gap-1.5 text-xs text-slate-600">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          paired.length ? "bg-emerald-600" : "bg-slate-400"
        }`}
        aria-hidden="true"
      />
      {paired.length
        ? `Printer paired over ${paired.join(" and ")}`
        : "No printer chosen yet — click Test print and pick it. A browser cannot see printers by itself."}
    </p>
  );
}

export function ProductLabelSheet({ products }: { products: LabelProduct[] }) {
  const [labelPngMap, setLabelPngMap] = useState<Record<number, string>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"" | "usb" | "serial" | "test">("");
  const [access, setAccess] = useState<PrinterAccess | null>(null);
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

  const refreshAccess = useCallback(() => {
    getPrinterAccess()
      .then(setAccess)
      .catch(() => setAccess(null));
  }, []);

  useEffect(refreshAccess, [refreshAccess]);

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
      refreshAccess();
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
      refreshAccess();
    }
  }

  /**
   * One diagnostic label. Prefers whichever transport is already granted, so
   * the common case raises no chooser; falls back to whatever the browser
   * supports when nothing is paired yet.
   */
  async function handleTestPrint() {
    if (busy) return;
    setBusy("test");
    try {
      const preferUsb =
        usbSupported && (access?.usbPaired || !access?.serialPaired);
      if (preferUsb) {
        await printTestLabelViaUsb();
      } else if (serialSupported) {
        await printTestLabelViaSerial();
      } else {
        await printTestLabelViaUsb();
      }
    } catch (error) {
      reportError(error, "Test print failed.");
    } finally {
      setBusy("");
      refreshAccess();
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

  /** Explicit re-pick, replacing the old automatic forget-on-failure. */
  async function handleForgetPort() {
    if (busy) return;
    try {
      await forgetSerialPrinter();
    } catch (error) {
      reportError(error, "Could not release the printer port.");
    } finally {
      refreshAccess();
    }
  }

  const testPrintButton = (
    <button
      type="button"
      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:opacity-50"
      disabled={busy !== ""}
      onClick={handleTestPrint}
      title="Prints one diagnostic sticker with a border on the printable edge"
    >
      {busy === "test" ? "Sending…" : "Test print"}
    </button>
  );

  // The test print is most useful in exactly this state: nothing to print, and
  // a printer you want to know the truth about.
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-slate-500">
          No products selected for label printing.
        </p>
        {testPrintButton}
        <PrinterStatus access={access} />
      </div>
    );
  }

  return (
    <div className="label-print-root">
      <div className="label-toolbar">
        {usbSupported && (
          <button
            type="button"
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!ready || busy !== ""}
            onClick={handleUsbPrint}
            title="Sends ESC/POS straight down the USB cable — no driver needed"
          >
            {busy === "usb"
              ? "Sending…"
              : `Print ${labelCount} label${labelCount === 1 ? "" : "s"} over USB`}
          </button>
        )}

        {serialSupported && (
          <button
            type="button"
            className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!ready || busy !== ""}
            onClick={handleSerialPrint}
            title="Pair the printer over Bluetooth, then pick its cu.* port"
          >
            {busy === "serial"
              ? "Sending…"
              : `Print ${labelCount} label${labelCount === 1 ? "" : "s"} over Bluetooth`}
          </button>
        )}

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

        {testPrintButton}

        {access?.serialPaired && (
          <button
            type="button"
            className="text-xs text-slate-600 underline disabled:opacity-50"
            disabled={busy !== ""}
            onClick={handleForgetPort}
            title="Forget the remembered Bluetooth port and pick again next print"
          >
            Choose a different port
          </button>
        )}

        <PrinterStatus access={access} />

        <p className="w-full text-xs text-slate-600">
          <strong>{labelCount}</strong> label{labelCount === 1 ? "" : "s"} ·{" "}
          {THERMAL_LABEL_SIZE_LABEL}. Printing sends the printer its own
          ESC/POS bytes, so nothing has to be installed on this computer. On a
          Mac, remove the POS58 print queue first — the system print service
          holds the USB port and the browser cannot claim it. Over Bluetooth,
          pick the <strong>cu.</strong> entry, not the bare name.
        </p>
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
