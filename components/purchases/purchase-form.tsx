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
  id: string;
  product?: Product | null;
  name: string;
  qty: number;
  rate: number;
  discountType: "percent" | "value";
  discountValue: number;
  hsnCode?: string;
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
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
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

  // Handling Charges and Paid Amount States
  const [handlingCharges, setHandlingCharges] = useState("0");
  const [paidAmount, setPaidAmount] = useState("0");

  // Custom Item Form State
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomNameField] = useState("");
  const [customHsn, setCustomHsn] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customRate, setCustomRate] = useState("");
  const [customDiscType, setCustomDiscType] = useState<"percent" | "value">("percent");
  const [customDiscVal, setCustomDiscVal] = useState("0");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
          const id = `p-${item.product.id}`;
          const existingIdx = updated.findIndex((i) => i.id === id);
          if (existingIdx !== -1) {
            updated[existingIdx] = {
              ...updated[existingIdx],
              qty: updated[existingIdx].qty + item.qty,
              rate: item.rate,
            };
          } else {
            updated.push({
              id,
              product: item.product,
              name: item.product.name,
              qty: item.qty,
              rate: item.rate,
              discountType: "percent",
              discountValue: 0,
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
    if (!product.hsnCode || !product.hsnCode.trim()) {
      alert(`HSN code is mandatory. Product "${product.name}" lacks an HSN code. Please update the product in Inventory first.`);
      return;
    }
    setItems((prev) => {
      const id = `p-${product.id}`;
      const existing = prev.find((i) => i.id === id);
      if (existing) {
        return prev.map((i) =>
          i.id === id ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [
        ...prev,
        {
          id,
          product,
          name: product.name,
          qty,
          rate: toNumber(product.purchaseRate),
          discountType: "percent",
          discountValue: 0,
        },
      ];
    });
    setQuery("");
    setResults([]);
  };

  const addCustomItem = () => {
    if (!customName.trim() || !customQty || !customRate) {
      alert("Product Name, Quantity, and Rate are required fields.");
      return;
    }
    if (!customHsn.trim()) {
      alert("HSN code is a mandatory field for manual entry.");
      return;
    }
    const qty = parseFloat(customQty) || 0;
    const rate = parseFloat(customRate) || 0;
    const discountValue = parseFloat(customDiscVal) || 0;
    if (qty <= 0 || rate < 0) return;

    setItems((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        product: null,
        name: customName.trim(),
        qty,
        rate,
        discountType: customDiscType,
        discountValue,
        hsnCode: customHsn.trim(),
      },
    ]);

    // Reset
    setCustomNameField("");
    setCustomHsn("");
    setCustomQty("1");
    setCustomRate("");
    setCustomDiscVal("0");
    setShowCustomForm(false);
  };

  const updateItem = (
    id: string,
    field: "qty" | "rate" | "discountValue",
    value: number,
    discountType?: "percent" | "value"
  ) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          const updated = { ...i, [field]: value };
          if (discountType !== undefined) {
            updated.discountType = discountType;
          }
          return updated;
        }
        return i;
      })
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const subtotal = items.reduce(
    (sum, i) => sum + calculateLineAmount(i.qty, i.rate, i.discountValue, i.discountType),
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
          handlingCharges: parseFloat(handlingCharges) || 0,
          paidAmount: paymentType === "cash" ? undefined : (parseFloat(paidAmount) || 0),
          items: items.map((i) => ({
            productId: i.product ? i.product.id : undefined,
            customName: i.product ? undefined : i.name,
            hsnCode: i.product ? (i.product.hsnCode || null) : i.hsnCode,
            qty: i.qty,
            rate: i.rate,
            discountType: i.discountType,
            discountValue: i.discountValue,
          })),
        });
        router.push("/purchases");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save purchase");
      }
    });
  };

  if (!mounted) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">New Purchase</h1>
          <p className="text-sm text-slate-500">Record stock inward from supplier</p>
        </div>
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-56 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

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
        <CardContent className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
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
                <SelectItem value="cash">Cash (Auto Paid)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Handling Charges (Proportional Landed Cost)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={handlingCharges}
              onChange={(e) => setHandlingCharges(e.target.value)}
              placeholder="0.00"
            />
          </div>
          {paymentType === "credit" && (
            <div className="space-y-2">
              <Label>Amount Paid to Supplier</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProductScanBar
            askQty
            autoFocus={false}
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
                <label className="flex flex-1 cursor-pointer">
                  <span className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Upload className="h-4 w-4 text-emerald-600" />
                    {isImporting ? "Importing..." : "Choose Excel File"}
                  </span>
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

          <div className="flex justify-between items-center text-xs border-t pt-2 text-slate-500">
            <span>Type to search product or scan barcode</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCustomForm(!showCustomForm)}
              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-semibold"
            >
              {showCustomForm ? "Hide Manual Entry" : "Manual Entry Form"}
            </Button>
          </div>

          {showCustomForm && (
            <Card className="border-dashed border-emerald-300 bg-emerald-50/30">
              <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Product Name *</Label>
                  <Input
                    className="h-9 bg-white"
                    placeholder="Enter manual product name..."
                    value={customName}
                    onChange={(e) => setCustomNameField(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">HSN Code *</Label>
                  <Input
                    className="h-9 bg-white"
                    placeholder="Mandatory HSN..."
                    value={customHsn}
                    onChange={(e) => setCustomHsn(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="h-9 bg-white"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Purchase Rate</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-9 bg-white"
                    placeholder="0.00"
                    value={customRate}
                    onChange={(e) => setCustomRate(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 md:col-span-2">
                  <Label className="text-xs">Line Discount</Label>
                  <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white">
                    <select
                      value={customDiscType}
                      onChange={(e) => setCustomDiscType(e.target.value as "percent" | "value")}
                      className="h-full rounded-l-md border-r border-slate-200 bg-slate-50 px-1.5 text-xs focus:outline-none"
                    >
                      <option value="percent">%</option>
                      <option value="value">₹</option>
                    </select>
                    <input
                      type="number"
                      value={customDiscVal}
                      onChange={(e) => setCustomDiscVal(e.target.value)}
                      className="h-full w-full rounded-r-md px-2 text-sm focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 md:col-span-2 flex justify-end items-end pt-1">
                  <Button size="sm" onClick={addCustomItem} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto h-9">
                    Add Manual Item
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3 bg-white shadow-sm"
                >
                  <p className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                    {item.name}
                    {item.product === null && (
                      <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold text-emerald-700 uppercase">
                        Manual {item.hsnCode ? `(HSN: ${item.hsnCode})` : ""}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-slate-400">Qty</Label>
                    <Input
                      type="number"
                      className="w-20 h-8 text-xs"
                      value={item.qty}
                      min={0.01}
                      step={0.01}
                      onChange={(e) =>
                        updateItem(
                          item.id,
                          "qty",
                          parseFloat(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-slate-400">Rate</Label>
                    <Input
                      type="number"
                      className="w-24 h-8 text-xs"
                      value={item.rate}
                      min={0}
                      step={0.01}
                      onChange={(e) =>
                        updateItem(
                          item.id,
                          "rate",
                          parseFloat(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-slate-400">Discount</Label>
                    <div className="flex h-8 items-center rounded border border-slate-200 bg-white">
                      <select
                        value={item.discountType}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "discountValue",
                            item.discountValue,
                            e.target.value as "percent" | "value"
                          )
                        }
                        className="h-full border-r border-slate-200 bg-slate-50 px-1 text-[10px] font-semibold text-slate-600 focus:outline-none"
                      >
                        <option value="percent">%</option>
                        <option value="value">₹</option>
                      </select>
                      <input
                        type="number"
                        value={item.discountValue || ""}
                        min={0}
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "discountValue",
                            parseFloat(e.target.value) || 0,
                            item.discountType
                          )
                        }
                        className="h-full w-14 px-1 text-center text-xs focus:outline-none"
                        placeholder="Disc"
                      />
                    </div>
                  </div>
                  <span className="w-24 text-right text-sm font-semibold text-slate-950">
                    {formatCurrency(calculateLineAmount(item.qty, item.rate, item.discountValue, item.discountType))}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
              <div className="flex justify-between border-t pt-3 font-bold text-sm text-slate-800">
                <span>Items Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Grand Total (incl. Handling)</span>
                <span className="text-emerald-700">{formatCurrency(subtotal + (parseFloat(handlingCharges) || 0))}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 font-medium">
          {error}
        </p>
      )}

      <Button size="lg" disabled={isPending} onClick={submit} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700">
        {isPending ? "Saving..." : "Save Purchase"}
      </Button>
    </div>
  );
}
