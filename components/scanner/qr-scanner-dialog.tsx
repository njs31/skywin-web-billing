"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type QrScannerDialogProps = {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
};

export function QrScannerDialog({ open, onClose, onScan }: QrScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    const scannerId = "qr-scanner-region";
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;
    setError("");

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          onScanRef.current(decoded.trim());
          void scanner.stop().then(() => onClose());
        },
        () => {}
      )
      .catch(() => {
        setError(
          "Camera access denied or unavailable. Use the barcode input field instead."
        );
      });

    return () => {
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
          <h3 className="font-semibold">Scan Product QR</h3>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          id="qr-scanner-region"
          className="overflow-hidden rounded-lg bg-black"
        />
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        <p className="mt-2 text-center text-xs text-slate-500">
          Point camera at product QR code
        </p>
      </div>
    </div>
  );
}
