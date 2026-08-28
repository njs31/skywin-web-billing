"use client";

import { useEffect, useMemo, useState } from "react";
import {
  barcodeDataUrl,
  downloadLabelPng,
  printLabelImages,
  productCode,
  type LabelProduct,
} from "@/lib/label-render";
import { BUSINESS } from "@/lib/business";
import { toNumber } from "@/lib/utils";

export type { LabelProduct };

/** Legacy sheet-printer keys — cleared on load. */
const LEGACY_OFFSET_KEY = "skywin-label-offset-mm";
const LEGACY_FLIP_KEY = "skywin-label-flip-180";

function inclusiveRate(saleRate: string | number, gstRate: string | number) {
  const rate = toNumber(saleRate);
  const gst = toNumber(gstRate);
  return Math.round(rate * (1 + gst / 100) * 100) / 100;
}

function formatExp(value: string | null) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function LabelPreview({
  product,
  barcodeDataUrl: barcodeSrc,
}: {
  product: LabelProduct;
  barcodeDataUrl: string;
}) {
  const code = productCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);

  return (
    <div className="thermal-label">
      <p className="thermal-label-brand">{BUSINESS.name}</p>
      <p className="thermal-label-tagline">({BUSINESS.tagline})</p>
      <p className="thermal-label-name">{product.name.toUpperCase()}</p>
      {barcodeSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={barcodeSrc} alt="" className="thermal-label-barcode" />
      ) : (
        <div className="thermal-label-barcode thermal-label-barcode-empty" />
      )}
      <p className="thermal-label-code">{code}</p>
      <div className="thermal-label-footer">
        <span>EXP: {exp || "—"}</span>
        <span className="thermal-label-rate">RATE: {rate.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function ProductLabelSheet({ products }: { products: LabelProduct[] }) {
  const [barcodeMap, setBarcodeMap] = useState<Record<number, string>>({});
  const [ready, setReady] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [copies, setCopies] = useState(1);

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
      const entries: Record<number, string> = {};
      for (const p of products) {
        try {
          entries[p.id] = barcodeDataUrl(productCode(p));
        } catch {
          entries[p.id] = "";
        }
      }
      if (!cancelled) {
        setBarcodeMap(entries);
        setReady(true);
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

  async function handlePrint() {
    if (!ready || printing) return;
    setPrinting(true);
    try {
      await printLabelImages(products, copies);
    } catch (error) {
      console.error(error);
      alert("Could not open print. Please try again.");
    } finally {
      setPrinting(false);
    }
  }

  async function handleDownload(product: LabelProduct) {
    try {
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
          disabled={!ready || printing}
          onClick={handlePrint}
        >
          {printing
            ? "Printing…"
            : ready
              ? "Print label"
              : "Preparing barcodes…"}
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
          × 25 mm for POSiFLOW TagPro. Prints as a <strong>picture</strong> (not
          PDF) so the barcode and product name appear correctly.
        </p>
        <p className="w-full rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          In the print dialog: choose your <strong>TagPro</strong> printer, paper{" "}
          <strong>50 × 25 mm</strong>, scale <strong>100%</strong>, margins{" "}
          <strong>None</strong>. Do not print a PDF file on this printer — it
          will print garbage text.
        </p>
      </div>
      <div className="thermal-label-preview-grid">
        {products.map((product) => (
          <div key={product.id} className="flex flex-col items-start gap-2">
            <LabelPreview
              product={product}
              barcodeDataUrl={barcodeMap[product.id] || ""}
            />
            <button
              type="button"
              className="no-print text-xs text-emerald-700 underline"
              onClick={() => handleDownload(product)}
            >
              Download PNG (for mobile app)
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
