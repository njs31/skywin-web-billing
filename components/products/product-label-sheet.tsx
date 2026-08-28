"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import { BUSINESS } from "@/lib/business";
import {
  THERMAL_LABEL_H_MM,
  THERMAL_LABEL_W_MM,
} from "@/lib/label-print-config";
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

const LABEL_W = THERMAL_LABEL_W_MM;
const LABEL_H = THERMAL_LABEL_H_MM;

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

function productCode(product: LabelProduct) {
  return (
    product.barcode?.trim() ||
    product.sku?.trim() ||
    `SW${String(product.id).padStart(6, "0")}`
  );
}

async function barcodeDataUrl(code: string): Promise<string> {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, code, {
    format: "CODE128",
    width: 1.4,
    height: 36,
    displayValue: false,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });
  return canvas.toDataURL("image/png");
}

function drawThermalLabel(
  doc: jsPDF,
  product: LabelProduct,
  barcodeImg: string
) {
  const padX = 1.2;
  const code = productCode(product);
  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const exp = formatExp(product.expiryDate);
  const textW = LABEL_W - padX * 2;

  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(5);
  doc.text(BUSINESS.name, padX, 2.2, { maxWidth: textW });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(3.8);
  doc.text(`(${BUSINESS.tagline})`, padX, 3.6, { maxWidth: textW });

  const nameLine =
    (doc
      .setFont("helvetica", "bold")
      .setFontSize(4.6)
      .splitTextToSize(product.name.toUpperCase(), textW)
      .slice(0, 1)[0] as string) || "";
  doc.text(nameLine, padX, 5.4, { maxWidth: textW });

  const barcodeH = 9;
  const barcodeY = 6.2;
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", padX, barcodeY, textW, barcodeH);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.text(code, LABEL_W / 2, barcodeY + barcodeH + 1.8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.8);
  const bottomY = LABEL_H - 1.4;
  doc.text(`EXP: ${exp || "—"}`, padX, bottomY);
  doc.setFont("helvetica", "bold");
  doc.text(`RATE: ${rate.toFixed(2)}`, LABEL_W - padX, bottomY, {
    align: "right",
  });
}

function buildLabelPdf(
  labels: LabelProduct[],
  barcodeMap: Record<number, string>
) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [LABEL_W, LABEL_H],
    compress: true,
  });

  labels.forEach((product, idx) => {
    if (idx > 0) doc.addPage([LABEL_W, LABEL_H], "landscape");
    drawThermalLabel(doc, product, barcodeMap[product.id] || "");
  });

  return doc;
}

function LabelPreview({
  product,
  barcodeDataUrl,
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
      {barcodeDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={barcodeDataUrl} alt="" className="thermal-label-barcode" />
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
          entries[p.id] = await barcodeDataUrl(productCode(p));
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

  const labels = useMemo(() => {
    const qty = Math.max(1, Math.min(99, copies));
    const printed: LabelProduct[] = [];
    for (const p of products) {
      for (let i = 0; i < qty; i++) printed.push(p);
    }
    return printed;
  }, [products, copies]);

  function printPdf() {
    const doc = buildLabelPdf(labels, barcodeMap);
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank");
    if (!opened) {
      doc.save("skywin-labels.pdf");
    }
  }

  if (products.length === 0) {
    return (
      <p className="p-6 text-sm text-slate-500">
        No products selected for label printing.
      </p>
    );
  }

  const labelCount = labels.length;

  return (
    <div className="label-print-root">
      <div className="no-print label-toolbar">
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!ready}
          onClick={printPdf}
        >
          {ready ? "Open print PDF" : "Preparing barcodes…"}
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
        <p className="text-xs text-slate-500">
          {labelCount} label{labelCount === 1 ? "" : "s"} · 50 × 25 mm thermal
          stickers for POSiFLOW TagPro (58 mm). In the print dialog use{" "}
          <strong>100% / Actual size</strong>, paper <strong>50 × 25 mm</strong>
          , margins <strong>None</strong>. USB from PC, or open the PDF on your
          phone with the Shreyans / POSiFLOW label app.
        </p>
      </div>
      <div className="thermal-label-preview-grid">
        {products.map((product) => (
          <LabelPreview
            key={product.id}
            product={product}
            barcodeDataUrl={barcodeMap[product.id] || ""}
          />
        ))}
      </div>
    </div>
  );
}
