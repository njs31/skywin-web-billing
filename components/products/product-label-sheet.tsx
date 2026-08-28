"use client";

import { useEffect, useMemo, useState } from "react";
import {
  downloadLabelPng,
  downloadLabelPngFiles,
  productCode,
  renderLabelPngMap,
  type LabelProduct,
} from "@/lib/label-render";
import { LABEL_GAP_MM } from "@/lib/label-print-config";
import {
  calibrateLabelGap,
  isUsbPrintSupported,
  printLabelsViaUsb,
  type PrinterLanguage,
} from "@/lib/thermal-usb-print";

export type { LabelProduct };

/**
 * The sticker roll is 50 × 25 mm die-cut, so the browser must be told the page
 * is one sticker. Without this a driver print lays the label on A4 and the
 * printer spits blank stock between every one.
 */
const PAGE_RULE = "@page { size: 50mm 25mm; margin: 0; }";

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
  const [busy, setBusy] = useState<"" | "print" | "calibrate">("");
  const [copies, setCopies] = useState(1);
  const [language, setLanguage] = useState<PrinterLanguage>("tspl");
  const [gapMm, setGapMm] = useState(LABEL_GAP_MM);
  const [density, setDensity] = useState(8);
  const [upright, setUpright] = useState(true);
  const usbSupported = isUsbPrintSupported();

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

  const printerOptions = { language, copies, gapMm, density, upright };

  function reportError(error: unknown, fallback: string) {
    // The user dismissed the Chrome device chooser; not an error.
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    console.error(error);
    alert(error instanceof Error ? error.message : fallback);
  }

  async function handleUsbPrint() {
    if (!ready || busy) return;
    setBusy("print");
    try {
      await printLabelsViaUsb(products, printerOptions);
    } catch (error) {
      reportError(error, "USB print failed. Check the cable and try again.");
    } finally {
      setBusy("");
    }
  }

  async function handleCalibrate() {
    if (busy) return;
    setBusy("calibrate");
    try {
      await calibrateLabelGap(printerOptions);
    } catch (error) {
      reportError(error, "Could not calibrate the label gap.");
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
        {usbSupported ? (
          <button
            type="button"
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!ready || busy !== ""}
            onClick={handleUsbPrint}
          >
            {busy === "print"
              ? "Sending to printer…"
              : `Print ${labelCount} label${labelCount === 1 ? "" : "s"} (USB)`}
          </button>
        ) : (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Direct printing needs Chrome or Edge on a computer. On a phone,
            download the PNG and print it from the POSiFLOW app.
          </p>
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
          className="rounded border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 disabled:opacity-50"
          disabled={!ready}
          onClick={() => window.print()}
          title="Prints the same label through the POSiFLOW driver installed on this computer"
        >
          Print via printer driver
        </button>

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
            Printer settings
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-4 rounded border border-slate-200 bg-slate-50 px-3 py-3">
            <label className="flex flex-col gap-1">
              Label language
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as PrinterLanguage)}
                className="h-8 rounded border border-slate-300 bg-white px-2"
              >
                <option value="tspl">TSPL — label roll (default)</option>
                <option value="escpos">ESC/POS — receipt mode</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              Gap between labels (mm)
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={gapMm}
                onChange={(e) => setGapMm(Number(e.target.value) || 0)}
                className="h-8 w-20 rounded border border-slate-300 px-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              Darkness (0–15)
              <input
                type="number"
                min={0}
                max={15}
                value={density}
                onChange={(e) =>
                  setDensity(Math.max(0, Math.min(15, Number(e.target.value) || 0)))
                }
                className="h-8 w-20 rounded border border-slate-300 px-2"
              />
            </label>

            <label className="flex items-center gap-2 pb-1.5">
              <input
                type="checkbox"
                checked={!upright}
                onChange={(e) => setUpright(!e.target.checked)}
              />
              Rotate 180°
            </label>

            {usbSupported && (
              <button
                type="button"
                className="h-8 rounded border border-slate-300 bg-white px-3 disabled:opacity-50"
                disabled={busy !== ""}
                onClick={handleCalibrate}
              >
                {busy === "calibrate" ? "Calibrating…" : "Calibrate label gap"}
              </button>
            )}

            <p className="w-full text-slate-600">
              Leave the language on <strong>TSPL</strong>. If the sticker comes
              out as lines of text or code, the printer is in the other mode —
              switch to ESC/POS. If labels creep up or down the roll, press{" "}
              <strong>Calibrate label gap</strong>.
            </p>
          </div>
        </details>

        <p className="w-full text-xs text-slate-600">
          <strong>{labelCount}</strong> label{labelCount === 1 ? "" : "s"} ·
          50 × 25 mm. <strong>Print (USB)</strong> talks to the printer directly
          and gives the sharpest barcode. If that says access denied, the
          printer is installed as a Windows/Mac printer — either remove it from
          the printer list, or just use{" "}
          <strong>Print via printer driver</strong> instead.
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
