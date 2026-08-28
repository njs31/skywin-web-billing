"use client";

import { useEffect, useMemo, useState } from "react";
import {
  downloadLabelPng,
  downloadLabelPngFiles,
  expandLabelUrls,
  openLabelPngInNewTab,
  productCode,
  renderLabelPngMap,
  type LabelProduct,
} from "@/lib/label-render";
import {
  isUsbPrintSupported,
  printLabelPngsViaUsb,
} from "@/lib/thermal-usb-print";

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
    try {
      localStorage.removeItem(LEGACY_OFFSET_KEY);
      localStorage.removeItem(LEGACY_FLIP_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const map = await renderLabelPngMap(products);
        if (!cancelled) {
          setLabelPngMap(map);
          setReady(true);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setReady(false);
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
    const urls = expandLabelUrls(products, labelPngMap, copies);
    if (urls.length === 0) {
      alert("Label is not ready yet. Wait a moment and try again.");
      return;
    }
    setUsbPrinting(true);
    try {
      await printLabelPngsViaUsb(urls);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return;
      }
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "USB print failed. Check the cable and try again."
      );
    } finally {
      setUsbPrinting(false);
    }
  }

  function handleDownloadAll() {
    if (!ready) return;
    downloadLabelPngFiles(products, labelPngMap, copies);
  }

  function handleOpenImage() {
    if (!ready) return;
    const urls = expandLabelUrls(products, labelPngMap, copies);
    if (urls.length === 0) {
      alert("Label is not ready yet. Wait a moment and try again.");
      return;
    }
    try {
      openLabelPngInNewTab(urls[0]);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "Could not open label image. Use Download instead."
      );
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
        {usbSupported ? (
          <button
            type="button"
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={!ready || usbPrinting}
            onClick={handleUsbPrint}
          >
            {usbPrinting
              ? "Printing…"
              : ready
                ? "Print to TagPro (USB)"
                : "Preparing label…"}
          </button>
        ) : null}
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${
            usbSupported
              ? "border border-slate-300 bg-white text-slate-700"
              : "bg-emerald-700 text-white"
          }`}
          disabled={!ready}
          onClick={handleDownloadAll}
        >
          Download label PNG
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          disabled={!ready}
          onClick={handleOpenImage}
        >
          Open label image
        </button>
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
          <strong>{labelCount}</strong> label{labelCount === 1 ? "" : "s"} · 50
          × 25 mm. Check the preview matches your sample before printing.
        </p>
        {usbSupported ? (
          <p className="w-full rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <strong>Print from PC:</strong> connect TagPro by USB cable → use{" "}
            <strong>Chrome or Edge</strong> → click{" "}
            <strong>Print to TagPro (USB)</strong> → pick your printer in the
            list. Do not use Ctrl+P in the browser.
          </p>
        ) : (
          <p className="w-full rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            For direct PC printing, open this page in <strong>Chrome or Edge</strong>{" "}
            with the printer on USB. Or download the PNG and print from{" "}
            <strong>Paint</strong> / the POSiFLOW phone app.
          </p>
        )}
        <p className="w-full rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          <strong>Never use browser Print (Ctrl+P)</strong> on the TagPro — it
          prints garbage text, not the label.
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
