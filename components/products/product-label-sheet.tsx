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
}: {
  product: LabelProduct;
  qrDataUrl: string;
}) {
  const code =
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`;
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);

  return (
    <div className="product-label relative box-border overflow-hidden border border-slate-900 bg-white text-black">
      <p className="truncate text-[7px] font-bold leading-tight tracking-wide">
        {BUSINESS.name}
      </p>
      <p className="truncate text-[5.5px] leading-tight">
        ({BUSINESS.tagline})
      </p>
      <p className="mt-0.5 line-clamp-2 text-[6.5px] font-semibold leading-tight">
        {product.name}
      </p>
      <p className="truncate text-[6px] leading-tight">{code}</p>
      <p className="text-[6px] leading-tight">EXP: {exp}</p>
      <div className="mt-0.5 flex items-end justify-between gap-1">
        <p className="text-[7px] font-bold leading-none">
          RATE: {rate.toFixed(2)}
        </p>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt=""
            className="h-[9mm] w-[9mm] shrink-0"
          />
        ) : null}
      </div>
    </div>
  );
}

export function ProductLabelSheet({ products }: { products: LabelProduct[] }) {
  const [qrMap, setQrMap] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: Record<number, string> = {};
      for (const p of products) {
        const code =
          p.barcode?.trim() || p.sku?.trim() || `SW${String(p.id).padStart(6, "0")}`;
        try {
          entries[p.id] = await QRCode.toDataURL(code, {
            margin: 0,
            width: 96,
            errorCorrectionLevel: "M",
          });
        } catch {
          entries[p.id] = "";
        }
      }
      if (!cancelled) setQrMap(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [products]);

  useEffect(() => {
    if (products.length === 0) return;
    if (Object.keys(qrMap).length < products.length) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [products, qrMap]);

  if (products.length === 0) {
    return (
      <p className="p-6 text-sm text-slate-500">
        No products selected for label printing.
      </p>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: 35mm 22mm;
            margin: 0;
          }
          body {
            margin: 0;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .product-label-sheet {
            display: block;
          }
          .product-label {
            width: 35mm;
            height: 22mm;
            page-break-after: always;
            padding: 1mm 1.2mm;
          }
        }
        @media screen {
          .product-label-sheet {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            padding: 16px;
          }
          .product-label {
            width: 35mm;
            height: 22mm;
            padding: 1mm 1.2mm;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
          }
        }
      `}</style>
      <div className="no-print flex items-center gap-3 border-b bg-white p-4">
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white"
          onClick={() => window.print()}
        >
          Print Labels (35×22 mm)
        </button>
        <p className="text-xs text-slate-500">
          {products.length} label{products.length === 1 ? "" : "s"} — use a
          label printer set to 35×22 mm
        </p>
      </div>
      <div className="product-label-sheet">
        {products.map((p) => (
          <LabelCard key={p.id} product={p} qrDataUrl={qrMap[p.id] || ""} />
        ))}
      </div>
    </>
  );
}
