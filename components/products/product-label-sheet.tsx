"use client";

import { useEffect, useState } from "react";
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

function LabelCard({
  product,
  qrDataUrl,
  isLast,
}: {
  product: LabelProduct;
  qrDataUrl: string;
  isLast: boolean;
}) {
  const code =
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`;
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);

  return (
    <div
      className={`product-label${isLast ? " product-label-last" : ""}`}
    >
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

export function ProductLabelSheet({ products }: { products: LabelProduct[] }) {
  const [qrMap, setQrMap] = useState<Record<number, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: Record<number, string> = {};
      for (const p of products) {
        const code =
          p.barcode?.trim() ||
          p.sku?.trim() ||
          `SW${String(p.id).padStart(6, "0")}`;
        try {
          entries[p.id] = await QRCode.toDataURL(code, {
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
          onClick={() => window.print()}
        >
          {ready ? "Print Labels (35×22 mm)" : "Preparing QR…"}
        </button>
        <p className="text-xs text-slate-500">
          {products.length} label{products.length === 1 ? "" : "s"}. In the print
          dialog set paper/margins to <strong>None</strong> and paper size{" "}
          <strong>35 × 22 mm</strong> (or custom). Enable{" "}
          <strong>Background graphics</strong> if QR is missing.
        </p>
      </div>
      <div className="product-label-sheet">
        {products.map((p, idx) => (
          <LabelCard
            key={p.id}
            product={p}
            qrDataUrl={qrMap[p.id] || ""}
            isLast={idx === products.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
