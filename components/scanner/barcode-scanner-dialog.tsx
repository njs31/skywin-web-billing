"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type BarcodeScannerDialogProps = {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
};

/**
 * What the camera is allowed to decode.
 *
 * Naming them is not just an optimisation, though it is one — every extra
 * format is another decoder run over every frame. It is also a statement of
 * what the shop actually scans: CODE_128 is what our own labels carry, the
 * EAN/UPC family is what arrives printed on manufacturers' packaging, and
 * QR_CODE is kept because labels printed before the redesign are still on
 * shelves and must not stop working.
 */
const FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
];

/**
 * The region of the frame that is actually decoded.
 *
 * It has to be a wide, shallow rectangle. A Code 128 on a 50 mm label is
 * around 37 mm long and 6 mm tall, and the square box this used to use — 250
 * by 250, the shape you want for a QR — cropped the ends off the barcode, so
 * it could not be decoded no matter how steadily you held the phone. Landscape
 * suits every linear symbology, and a QR still fits inside it.
 */
function scanBox(viewfinderWidth: number, viewfinderHeight: number) {
  const width = Math.max(200, Math.floor(viewfinderWidth * 0.92));
  const height = Math.max(140, Math.floor(viewfinderHeight * 0.45));
  return {
    width: Math.min(width, viewfinderWidth),
    height: Math.min(height, viewfinderHeight),
  };
}

export function BarcodeScannerDialog({
  open,
  onClose,
  onScan,
}: BarcodeScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const scannerId = "barcode-scanner-region";
    const scanner = new Html5Qrcode(scannerId, {
      formatsToSupport: FORMATS,
      verbose: false,
    });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: scanBox },
        (decoded) => {
          onScanRef.current(decoded.trim());
          void scanner.stop().then(() => onClose());
        },
        () => {}
      )
      .then(() => {
        if (!cancelled) setError("");
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Camera access denied or unavailable. Use the barcode input field instead."
          );
        }
      });

    return () => {
      cancelled = true;
      if (scannerRef.current?.isScanning) {
        void scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current = null;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Scan barcode</h3>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          id="barcode-scanner-region"
          className="overflow-hidden rounded-lg bg-black"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-2 text-center text-xs text-slate-500">
          Hold the barcode across the box, filling most of its width
        </p>
      </div>
    </div>
  );
}
