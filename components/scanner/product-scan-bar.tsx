"use client";

import { useCallback, useRef, useState } from "react";
import { Scan, Camera } from "lucide-react";
import { getProductByScanCode } from "@/lib/actions/products";
import type { Product } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrScannerDialog } from "./qr-scanner-dialog";

type ProductScanBarProps = {
  onProductScanned: (product: Product, qty: number) => void;
  /** If true, prompt for quantity after each scan (purchase/stock). */
  askQty?: boolean;
  defaultQty?: number;
  placeholder?: string;
  autoFocus?: boolean;
};

export function ProductScanBar({
  onProductScanned,
  askQty = false,
  defaultQty = 1,
  placeholder = "Scan barcode or type code + Enter",
  autoFocus = true,
}: ProductScanBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanValue, setScanValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(String(defaultQty));
  const [error, setError] = useState("");
  const [lastScanned, setLastScanned] = useState("");

  const processCode = useCallback(
    async (code: string) => {
      setError("");
      const trimmed = code.trim();
      if (!trimmed) return;

      const product = await getProductByScanCode(trimmed);
      if (!product) {
        setError(`No product found for: ${trimmed}`);
        setScanValue("");
        inputRef.current?.focus();
        return;
      }

      setLastScanned(product.name);
      setScanValue("");

      if (askQty) {
        setPendingProduct(product);
        setQty(String(defaultQty));
      } else {
        onProductScanned(product, defaultQty);
        inputRef.current?.focus();
      }
    },
    [askQty, defaultQty, onProductScanned]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void processCode(scanValue);
    }
  };

  const confirmQty = () => {
    if (!pendingProduct) return;
    const q = parseFloat(qty);
    if (!q || q <= 0) {
      setError("Enter a valid quantity");
      return;
    }
    onProductScanned(pendingProduct, q);
    setPendingProduct(null);
    setError("");
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Scan className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            ref={inputRef}
            className="pl-10"
            placeholder={placeholder}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={autoFocus}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setCameraOpen(true)}
          title="Open camera scanner"
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>

      {lastScanned && !error && !pendingProduct && (
        <p className="text-xs text-emerald-600">Last scanned: {lastScanned}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {pendingProduct && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{pendingProduct.name}</p>
            <p className="text-xs text-slate-500">
              {pendingProduct.barcode ?? pendingProduct.sku ?? `ID ${pendingProduct.id}`}
            </p>
          </div>
          <div className="w-24">
            <Label className="text-xs">Qty</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmQty()}
              autoFocus
            />
          </div>
          <Button type="button" size="sm" onClick={confirmQty}>
            Add
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPendingProduct(null)}
          >
            Cancel
          </Button>
        </div>
      )}

      <QrScannerDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(code) => void processCode(code)}
      />
    </div>
  );
}
