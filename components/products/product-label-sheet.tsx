"use client";

import { useEffect, useMemo, useState } from "react";
import {
  downloadLabelPng,
  downloadLabelPngFiles,
  expandProducts,
  productCode,
  renderLabelPngMap,
  type LabelProduct,
} from "@/lib/label-render";
import { isUsbPrintSupported, printLabelsViaUsb } from "@/lib/thermal-usb-print";

export type { LabelProduct };

const LEGACY_OFFSET_KEY = "skywin-label-offset-mm";
const LEGACY_FLIP_KEY = "skywin-label-flip-180";

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
  const [usbPrinting, setUsbPrinting] = useState(false);
  const [copies, setCopies] = useState(1);
  const usbSupported = isUsbPrintSupported();

  useEffect(() => {
    const blockBrowserPrint = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        window.alert(
          "Browser Print does not work on the TagPro — it prints garbage text.\n\nUse “Download label PNG” (phone app) or “Print to TagPro (USB)” in Chrome with USB cable."
        );
      }
    };
    window.addEventListener("keydown", blockBrowserPrint);
    return () => window.removeEventListener("keydown", blockBrowserPrint);
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_OFFSET_KEY);
      localStorage.removeItem(LEGACY_FLIP_KEY);
    } catch {
      /* ignore */
    }
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

  const labelCount = useMemo(() => {
    const qty = Math.max(1, Math.min(99, copies));
    return products.length * qty;
  }, [products, copies]);

  async function handleUsbPrint() {
    if (!ready || usbPrinting) return;
    setUsbPrinting(true);
    try {
      await printLabelsViaUsb(expandProducts(products, copies));
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return;
      }
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "USB print failed. Use Download label PNG instead."
      );
    } finally {
      setUsbPrinting(false);
    }
  }

  function handleDownloadAll() {
    if (!ready) return;
    downloadLabelPngFiles(products, labelPngMap, copies);
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
      console.error(error);
      alert("Could not download label image.");
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
      <div className="no-print label-toolbar">
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!ready}
          onClick={handleDownloadAll}
        >
          {ready ? "Download label image (PNG)" : "Preparing label…"}
        </button>
        {usbSupported ? (
          <button
            type="button"
            className="rounded border border-emerald-700 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 disabled:opacity-50"
            disabled={!ready || usbPrinting}
            onClick={handleUsbPrint}
          >
            {usbPrinting ? "Sending label image…" : "Print to POSiFLOW (USB)"}
          </button>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Copies per product
          <input
            type="number"
            min={1}
            max={99}
            value={copies}
            onChange={(e) => setCopies(Number(e.target.value) || 1)}
            className="h-8 w-14 rounded border border-slate-300 px-2 text-sm"
          />
        </label>
        <p className="w-full text-xs text-slate-600">
          <strong>{labelCount}</strong> label{labelCount === 1 ? "" : "s"} · 35
          × 22 mm at 203 DPI. The preview below is exactly what will print.
        </p>
        <p className="w-full rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
          <strong>Do not use browser Print (⌘P / File → Print):</strong> it can
          send PostScript source code to this POSiFLOW printer. Use the USB button
          above, or download the PNG and print it through the POSiFLOW app/driver.
        </p>
        <p className="w-full rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <strong>From computer (USB):</strong> Google Chrome or Edge → connect
          POSiFLOW by USB → click <strong>Print to POSiFLOW (USB)</strong> → pick
          the printer. This sends a 35 × 22 mm raster label, not text commands.
        </p>
        <p className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <strong>From phone:</strong> Download PNG → open{" "}
          <strong>Shreyans / POSiFLOW Easy Label</strong> → import image → set
          label size to <strong>35 × 22 mm</strong> → print on Bluetooth.
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
              className="no-print text-xs text-emerald-700 underline"
              onClick={() => handleDownloadOne(product)}
              disabled={!labelPngMap[product.id]}
            >
              Download this label
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
