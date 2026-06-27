"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, Upload, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { searchProducts, resolveProductsForImport } from "@/lib/actions/products";
import * as XLSX from "xlsx";
import { createPurchase } from "@/lib/actions/purchases";
import { calculateLineAmount } from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Product, Supplier } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductScanBar } from "@/components/scanner/product-scan-bar";
import { useRouter } from "next/navigation";

type LineItem = {
  product: Product;
  qty: number;
  rate: number;
};

function parseExcelFile(file: File): Promise<{ code: string; qty: number; rate?: number }[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });

        // Auto-detect header row
        let headerRowIndex = 0;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          
          const hasItemOrCode = row.some(cell => {
            const val = String(cell).toLowerCase().trim().replace(/\s/g, "");
            return val.includes("item") || val.includes("description") || val.includes("name") || val.includes("barcode") || val.includes("sku") || val.includes("code");
          });
          
          const hasQty = row.some(cell => {
            const val = String(cell).toLowerCase().trim().replace(/\s/g, "");
            return val.includes("qty") || val.includes("quantity") || val.includes("stock") || val.includes("units");
          });
          
          if (hasItemOrCode && hasQty) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = rows[headerRowIndex].map(h => String(h).toLowerCase().trim().replace(/\s/g, ""));
        const codeIdx = headers.findIndex(h => h.includes("barcode") || h.includes("qr") || h.includes("sku") || h.includes("code") || h.includes("item") || h.includes("description") || h.includes("name"));
        const qtyIdx = headers.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("stock") || h.includes("units"));
        const rateIdx = headers.findIndex(h => h.includes("rate") || h.includes("price") || h.includes("cost"));

        const parsed: { code: string; qty: number; rate?: number }[] = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;
          
          const code = codeIdx !== -1 ? String(row[codeIdx] ?? "").trim() : "";
          const qty = qtyIdx !== -1 ? parseFloat(String(row[qtyIdx] ?? "0")) : 0;
          const rate = rateIdx !== -1 && row[rateIdx] !== "" && row[rateIdx] !== undefined ? parseFloat(String(row[rateIdx])) : undefined;
          
          if (code && !isNaN(qty) && qty > 0) {
            const lowerCode = code.toLowerCase();
            if (lowerCode.includes("total") || lowerCode.includes("margerp") || lowerCode.includes("items")) {
              continue;
            }
            parsed.push({ code, qty, rate });
          }
        }

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function PurchaseForm({
  suppliers: initialSuppliers,
}: {
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [suppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [paymentType, setPaymentType] = useState<"credit" | "cash">("credit");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [importStatus, setImportStatus] = useState<{
    successCount: number;
    failedCount: number;
    failedRows: { row: number; code: string; reason: string }[];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);
    setError("");

    try {
      const parsedRows = await parseExcelFile(file);
      if (parsedRows.length === 0) {
        throw new Error("No valid rows found in Excel sheet. Make sure columns Barcode/Name and Quantity exist.");
      }

      const res = await resolveProductsForImport(parsedRows);
      
      setItems((prev) => {
        const updated = [...prev];
        for (const item of res.resolved) {
          const existingIdx = updated.findIndex((i) => i.product.id === item.product.id);
          if (existingIdx !== -1) {
            updated[existingIdx] = {
              ...updated[existingIdx],
              qty: updated[existingIdx].qty + item.qty,
              rate: item.rate,
            };
          } else {
            updated.push({
              product: item.product,
              qty: item.qty,
              rate: item.rate,
            });
          }
        }
        return updated;
      });

      setImportStatus({
        successCount: res.resolved.length,
        failedCount: res.failed.length,
        failedRows: res.failed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import excel file.");
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim()) {
        setResults(await searchProducts(query, 10));
      } else {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const addItem = (product: Product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [
        ...prev,
        { product, qty, rate: toNumber(product.purchaseRate) },
      ];
    });
    setQuery("");
    setResults([]);
  };

  const updateItem = (
    productId: number,
    field: "qty" | "rate",
    value: number
  ) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, [field]: value } : i
      )
    );
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const subtotal = items.reduce(
    (sum, i) => sum + calculateLineAmount(i.qty, i.rate),
    0
  );

  const submit = () => {
    if (!supplierId || items.length === 0) {
      setError("Select a supplier and add at least one item");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await createPurchase({
          supplierId: parseInt(supplierId, 10),
          invoiceNo: invoiceNo || undefined,
          paymentType,
          items: items.map((i) => ({
            productId: i.product.id,
            qty: i.qty,
            rate: i.rate,
          })),
        });
        router.push("/purchases");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save purchase");
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">New Purchase</h1>
        <p className="text-sm text-slate-500">Record stock inward from supplier</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Invoice No (optional)</Label>
            <Input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="Supplier invoice number"
            />
          </div>
          <div className="space-y-2">
            <Label>Payment Type</Label>
            <Select
              value={paymentType}
              onValueChange={(v) => setPaymentType(v as "credit" | "cash")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProductScanBar
            askQty
            onProductScanned={(product, qty) => addItem(product, qty)}
            placeholder="Scan QR / barcode to add stock items"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Search Product</Label>
              <Input
                placeholder="Or search products by name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Import via Excel (Marg report supported)</Label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <Button type="button" variant="outline" className="w-full flex items-center justify-center gap-2 h-10" asChild disabled={isImporting}>
                    <span>
                      <Upload className="h-4 w-4 text-emerald-600" />
                      {isImporting ? "Importing..." : "Choose Excel File"}
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleExcelImport}
                    disabled={isImporting}
                  />
                </label>
              </div>
            </div>
          </div>

          {importStatus && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Excel Import Results</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <p className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  Successfully imported: <strong>{importStatus.successCount}</strong> items
                </p>
                {importStatus.failedCount > 0 && (
                  <p className="flex items-center gap-1.5 text-red-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Failed to match: <strong>{importStatus.failedCount}</strong> items
                  </p>
                )}
              </div>
              {importStatus.failedRows.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <p className="font-semibold text-slate-700 mb-1">Failed Items (Verify barcode/name in DB):</p>
                  <div className="max-h-24 overflow-y-auto space-y-1 text-slate-500 font-mono">
                    {importStatus.failedRows.map((f, idx) => (
                      <p key={idx}>Row {f.row}: "{f.code}" &mdash; {f.reason}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {results.length > 0 && (
            <div className="rounded-lg border border-slate-200">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between border-b px-4 py-2 text-left hover:bg-slate-50"
                  onClick={() => addItem(p)}
                >
                  <span className="text-sm">{p.name}</span>
                  <Plus className="h-4 w-4 text-emerald-600" />
                </button>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  <p className="min-w-0 flex-1 text-sm font-medium">
                    {item.product.name}
                  </p>
                  <Input
                    type="number"
                    className="w-24"
                    value={item.qty}
                    min={0.01}
                    step={0.01}
                    onChange={(e) =>
                      updateItem(
                        item.product.id,
                        "qty",
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
                  <Input
                    type="number"
                    className="w-28"
                    value={item.rate}
                    min={0}
                    step={0.01}
                    onChange={(e) =>
                      updateItem(
                        item.product.id,
                        "rate",
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
                  <span className="w-24 text-right text-sm font-semibold">
                    {formatCurrency(calculateLineAmount(item.qty, item.rate))}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeItem(item.product.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <div className="flex justify-between border-t pt-3 font-bold">
                <span>Total</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Button size="lg" disabled={isPending} onClick={submit}>
        {isPending ? "Saving..." : "Save Purchase"}
      </Button>
    </div>
  );
}
