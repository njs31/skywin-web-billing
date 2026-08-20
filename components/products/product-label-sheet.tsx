"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
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

/**
 * Physical sticker sheet: 105 × 297 mm (A4 half), 3 × 10 of 35 × 22 mm.
 * Stickers touch horizontally; rounded corners look like small gaps.
 */
const LABEL_COLS = 3;
const LABEL_ROWS = 10;
const LABELS_PER_SHEET = LABEL_COLS * LABEL_ROWS;
const PAGE_W = 105;
const PAGE_H = 297;
const LABEL_W = 35;
const LABEL_H = 22;
const PAD_LEFT = 0;
const PAD_TOP = 5.5;
const COL_GAP = 0;
const ROW_GAP = 7.33;
const QR_MM = 7;
const CONTENT_H = 14;
const OFFSET_KEY = "skywin-label-offset-mm";
const FLIP_KEY = "skywin-label-flip-180";

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
        <div className="label-body">
          <div className="label-text">
            <p className="label-name">{product.name.toUpperCase()}</p>
            <p className="label-code">{code}</p>
            <p className="label-exp">EXP: {exp || ""}</p>
            <p className="label-rate">RATE: {rate.toFixed(2)}</p>
          </div>
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

function drawPdfLabel(
  doc: jsPDF,
  product: LabelProduct,
  qrDataUrl: string,
  x: number,
  y: number,
  flip180: boolean
) {
  const padX = 1.0;
  const qr = QR_MM;
  const textW = LABEL_W - padX * 2 - qr - 0.8;
  const topPad = (LABEL_H - CONTENT_H) / 2;

  const rate = inclusiveRate(product.saleRate, product.gstRate);
  const nameLine =
    (doc
      .setFont("helvetica", "bold")
      .setFontSize(5.2)
      .splitTextToSize(product.name.toUpperCase(), textW)
      .slice(0, 1)[0] as string) || "";

  type Line = {
    text: string;
    dy: number;
    size: number;
    bold?: boolean;
    full?: boolean;
  };

  const lines: Line[] = [
    { text: BUSINESS.name, dy: 1.6, size: 5.5, bold: true, full: true },
    { text: `(${BUSINESS.tagline})`, dy: 3.2, size: 4.2 },
    { text: nameLine, dy: 5.4, size: 5.2, bold: true },
    { text: productCode(product), dy: 8.0, size: 7, bold: true },
    {
      text: `EXP: ${formatExp(product.expiryDate)}`,
      dy: 10.4,
      size: 5.2,
    },
    { text: `RATE: ${rate.toFixed(2)}`, dy: 13.0, size: 6.2, bold: true },
  ];

  doc.setTextColor(0, 0, 0);

  for (const line of lines) {
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    doc.setFontSize(line.size);
    const maxW = line.full ? LABEL_W - padX * 2 : textW;
    if (flip180) {
      // Rotate around the cell so printer/sheet feed comes out upright.
      doc.text(line.text, x + LABEL_W - padX, y + LABEL_H - (topPad + line.dy), {
        angle: 180,
        maxWidth: maxW,
      });
    } else {
      doc.text(line.text, x + padX, y + topPad + line.dy, { maxWidth: maxW });
    }
  }

  if (qrDataUrl) {
    if (flip180) {
      doc.addImage(
        qrDataUrl,
        "PNG",
        x + padX,
        y + LABEL_H - (topPad + 5.0) - qr,
        qr,
        qr,
        undefined,
        "NONE",
        180
      );
    } else {
      doc.addImage(
        qrDataUrl,
        "PNG",
        x + LABEL_W - padX - qr,
        y + topPad + 5.0,
        qr,
        qr
      );
    }
  }
}

function buildLabelPdf(
  pages: (LabelProduct | null)[][],
  qrMap: Record<number, string>,
  offsetX: number,
  offsetY: number,
  flip180: boolean
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [PAGE_W, PAGE_H],
    compress: true,
  });

  pages.forEach((page, pageIdx) => {
    if (pageIdx > 0) doc.addPage([PAGE_W, PAGE_H], "portrait");
    page.forEach((product, idx) => {
      if (!product) return;
      const col = idx % LABEL_COLS;
      const row = Math.floor(idx / LABEL_COLS);
      const x = PAD_LEFT + offsetX + col * (LABEL_W + COL_GAP);
      const y = PAD_TOP + offsetY + row * (LABEL_H + ROW_GAP);
      drawPdfLabel(doc, product, qrMap[product.id] || "", x, y, flip180);
    });
  });

  return doc;
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
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  // Default on — your sheet was printing upside-down on the top-left sticker.
  const [flip180, setFlip180] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OFFSET_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x?: number; y?: number };
        if (Number.isFinite(parsed.x)) setOffsetX(parsed.x as number);
        if (Number.isFinite(parsed.y)) setOffsetY(parsed.y as number);
      }
      const flip = localStorage.getItem(FLIP_KEY);
      if (flip === "0") setFlip180(false);
      if (flip === "1") setFlip180(true);
    } catch {
      /* ignore */
    }
  }, []);

  function setOffset(nextX: number, nextY: number) {
    setOffsetX(nextX);
    setOffsetY(nextY);
    localStorage.setItem(OFFSET_KEY, JSON.stringify({ x: nextX, y: nextY }));
  }

  function setFlip(next: boolean) {
    setFlip180(next);
    localStorage.setItem(FLIP_KEY, next ? "1" : "0");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: Record<number, string> = {};
      for (const p of products) {
        try {
          entries[p.id] = await QRCode.toDataURL(productCode(p), {
            margin: 0,
            width: 256,
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

  function printPdf() {
    const doc = buildLabelPdf(pages, qrMap, offsetX, offsetY, flip180);
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

  const labelCount = products.length * Math.max(1, copies);

  return (
    <div className="label-print-root">
      <div className="no-print label-toolbar">
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!ready}
          onClick={printPdf}
        >
          {ready ? "Open print PDF" : "Preparing QR…"}
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
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Shift X mm
          <input
            type="number"
            step={0.5}
            value={offsetX}
            onChange={(e) => setOffset(Number(e.target.value) || 0, offsetY)}
            className="h-8 w-16 rounded border border-slate-300 px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          Shift Y mm
          <input
            type="number"
            step={0.5}
            value={offsetY}
            onChange={(e) => setOffset(offsetX, Number(e.target.value) || 0)}
            className="h-8 w-16 rounded border border-slate-300 px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={flip180}
            onChange={(e) => setFlip(e.target.checked)}
          />
          Rotate 180° (fix upside-down print)
        </label>
        <p className="text-xs text-slate-500">
          {labelCount} label{labelCount === 1 ? "" : "s"} on a 105 × 297 mm
          sheet (3 × 10 of 35 × 22 mm). Print at{" "}
          <strong>100% / Actual size</strong>, paper{" "}
          <strong>105 × 297 mm</strong> (not A4), margins <strong>None</strong>.
          Keep “Rotate 180°” on if the text comes out inverted.
        </p>
      </div>
      {pages.map((page, pageIdx) => (
        <div
          key={pageIdx}
          className="product-label-sheet"
          style={{
            transform: `translate(${offsetX}mm, ${offsetY}mm)`,
          }}
        >
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
