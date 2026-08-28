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

const PRINT_BLOCK_MESSAGE =
  "Do not use File → Print, Ctrl+P, or a PDF. That sends source code to the POSiFLOW printer.\n\nUse “Print to POSiFLOW (USB)” in Chrome, or download the PNG and print it only from the POSiFLOW / Easy Label app.";

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
  const [usbPrinting, setUsbPrinting] = useState(false);
  const [copies, setCopies] = useState(1);
  const usbSupported = isUsbPrintSupported();

  useEffect(() => {
    document.body.classList.add("thermal-label-page");
    const blockKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        event.stopPropagation();
        window.alert(PRINT_BLOCK_MESSAGE);
      }
    };
    const blockPrint = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      window.alert(PRINT_BLOCK_MESSAGE);
    };
    window.addEventListener("keydown", blockKey, true);
    window.addEventListener("beforeprint", blockPrint, true);
    return () => {
      document.body.classList.remove("thermal-label-page");
      window.removeEventListener("keydown", blockKey, true);
      window.removeEventListener("beforeprint", blockPrint, true);
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
          : "USB print failed. Use Download PNG and print from the POSiFLOW app — not from Windows/Mac Print."
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
        {usbSupported ? (
          <button
            type="button"
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!ready || usbPrinting}
            onClick={handleUsbPrint}
          >
            {usbPrinting ? "Sending label image…" : "Print to POSiFLOW (USB)"}
          </button>
        ) : (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            USB print needs Google Chrome or Edge on a computer. On a phone,
            download the PNG and print from the POSiFLOW app.
          </p>
        )}
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:opacity-50"
          disabled={!ready}
          onClick={handleDownloadAll}
        >
          {ready ? "Download PNG for POSiFLOW app" : "Preparing label…"}
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
          × 25 mm barcode image. Preview only — this page cannot be printed.
        </p>
        <p className="w-full rounded border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-950">
          <strong>If the sticker shows source code, a PDF was sent.</strong> Never
          use File → Print, Ctrl+P, “All labels PDF”, Preview, or the Windows/Mac
          printer dialog. Those wrap the label in PDF/PostScript, and this
          printer prints that code as text.
        </p>
        <p className="w-full rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <strong>Computer:</strong> Chrome/Edge + USB cable →{" "}
          <strong>Print to POSiFLOW (USB)</strong>. That sends a picture, not a
          document.
        </p>
        <p className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <strong>Phone:</strong> Download PNG → open{" "}
          <strong>POSiFLOW / Easy Label</strong> → import image → size{" "}
          <strong>50 × 25 mm</strong> → print over Bluetooth. Do not share the file
          to a system printer.
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
              Download this PNG
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
