"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { BUSINESS } from "@/lib/business";
import { toNumber } from "@/lib/utils";

export type LabelProduct = {
  id: number;
  name: string;
  barcode: string | null;
  sku: string | null;
  saleRate: string;
  gstRate: string;
  expiryDate: string | null;
};

/** 35×22 mm stickers on a vertical A4-half sheet (105×297 mm) — 3 across, 10 down. */
const LABEL_COLS = 3;
const LABEL_ROWS = 10;
const LABELS_PER_SHEET = LABEL_COLS * LABEL_ROWS;

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

function productCode(product: LabelProduct) {
  return (
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

function LabelCard({
  product,
  qrDataUrl,
}: {
  product: LabelProduct | null;
  qrDataUrl: string;
}) {
  if (!product) {
    return <div className="product-label product-label-empty" />;
  }

  const code = productCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);

  return (
    <div className="product-label">
      <div className="product-label-inner">
        <p className="label-brand">{BUSINESS.name}</p>
        <p className="label-tagline">({BUSINESS.tagline})</p>
        <p className="label-name">{product.name}</p>
        <p className="label-code">{code}</p>
        <p className="label-exp">EXP: {exp || "—"}</p>
        <div className="label-footer">
          <p className="label-rate">RATE: {rate.toFixed(2)}</p>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="" className="label-qr" />
          ) : (
            <div className="label-qr label-qr-empty" />
          )}
        </div>
      </div>
    </div>
  );
}

function printA4Sheet() {
  let style = document.getElementById(
    "skywin-print-page-size"
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "skywin-print-page-size";
    document.head.appendChild(style);
  }
  style.textContent = "@page { size: 105mm 297mm; margin: 0; }";
  document.documentElement.dataset.printSize = "A4";
  window.print();
}

function chunkPages(slots: (LabelProduct | null)[]) {
  const pages: (LabelProduct | null)[][] = [];
  for (let i = 0; i < Math.max(slots.length, 1); i += LABELS_PER_SHEET) {
    const page = slots.slice(i, i + LABELS_PER_SHEET);
    while (page.length < LABELS_PER_SHEET) page.push(null);
    pages.push(page);
  }
  return pages;
}

export function ProductLabelSheet({ products }: { products: LabelProduct[] }) {
  const [qrMap, setQrMap] = useState<Record<number, string>>({});
  const [ready, setReady] = useState(false);
  const [startAt, setStartAt] = useState(1);
  const [copies, setCopies] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: Record<number, string> = {};
      for (const p of products) {
        try {
          entries[p.id] = await QRCode.toDataURL(productCode(p), {
            margin: 0,
            width: 128,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#ffffff" },
          });
        } catch {
          entries[p.id] = "";
        }
      }
      if (!cancelled) {
        setQrMap(entries);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [products]);

  const pages = useMemo(() => {
    const skip = Math.max(0, Math.min(LABELS_PER_SHEET - 1, startAt - 1));
    const qty = Math.max(1, Math.min(LABELS_PER_SHEET, copies));
    const printed: LabelProduct[] = [];
    for (const p of products) {
      for (let i = 0; i < qty; i++) printed.push(p);
    }
    return chunkPages([...Array(skip).fill(null), ...printed]);
  }, [products, startAt, copies]);

  if (products.length === 0) {
    return (
      <p className="p-6 text-sm text-slate-500">
        No products selected for label printing.
      </p>
    );
  }

  const labelCount = products.length * Math.max(1, copies);

  return (
    <div className="label-print-root">
      <div className="no-print label-toolbar">
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!ready}
          onClick={printA4Sheet}
        >
          {ready ? "Print half-A4 sheet" : "Preparing QR…"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Start at
          <input
            type="number"
            min={1}
            max={LABELS_PER_SHEET}
            value={startAt}
            onChange={(e) => setStartAt(Number(e.target.value) || 1)}
            className="h-8 w-14 rounded border border-slate-300 px-2 text-sm"
          />
          <span className="text-slate-400">(1 = top-left)</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Copies
          <input
            type="number"
            min={1}
            max={LABELS_PER_SHEET}
            value={copies}
            onChange={(e) => setCopies(Number(e.target.value) || 1)}
            className="h-8 w-14 rounded border border-slate-300 px-2 text-sm"
          />
        </label>
        <p className="text-xs text-slate-500">
          {labelCount} label{labelCount === 1 ? "" : "s"} on a vertical half
          A4 sheet (105×297 mm, 3 × 10 of 35×22 mm). Print dialog: paper{" "}
          <strong>105 × 297 mm</strong> if listed, otherwise A4, feed the half
          sheet on the <strong>left</strong>, margins <strong>None</strong>,
          scale <strong>100%</strong>. Enable <strong>Background graphics</strong>{" "}
          if the QR is missing.
        </p>
      </div>
      {pages.map((page, pageIdx) => (
        <div key={pageIdx} className="product-label-sheet">
          {page.map((p, idx) => (
            <LabelCard
              key={`${pageIdx}-${idx}-${p?.id ?? "empty"}`}
              product={p}
              qrDataUrl={p ? qrMap[p.id] || "" : ""}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
