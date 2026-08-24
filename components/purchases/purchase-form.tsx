"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { searchProductBatches, resolveProductsForImport } from "@/lib/actions/products";
import * as XLSX from "xlsx";
import { createPurchase } from "@/lib/actions/purchases";
import { calculateLineAmount } from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Product, Supplier } from "@/db/schema";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
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
import { ProductBatchSearchResults } from "@/components/products/product-batch-search-results";
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
  batchNumber?: string;
  expiryDate?: string;
  gstRate?: number;
  saleRate?: number;
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
          const qtyRaw = qtyIdx !== -1 ? parseFloat(String(row[qtyIdx] ?? "0")) : 0;
          const qty = Math.round(qtyRaw);
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
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [paymentType, setPaymentType] = useState<"credit" | "cash">("credit");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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
  const [customGst, setCustomGst] = useState("0");
  const [customSaleRate, setCustomSaleRate] = useState("");
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
    const q = query.trim();
    if (!q) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        setResults(
          await searchProductBatches(q, 15, { onlyInStock: false })
        );
      } finally {
        setIsSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const addItem = (product: Product, qty = 1, batch?: {
    batchNumber?: string;
    expiryDate?: string;
    rate?: number;
    saleRate?: number;
  }) => {
    if (!product.hsnCode || !product.hsnCode.trim()) {
      alert(`HSN code is mandatory. Product "${product.name}" lacks an HSN code. Please update the product in Inventory first.`);
      return;
    }
    const wholeQty = Math.max(1, Math.round(qty) || 1);
    const nextSaleRate = batch?.saleRate ?? toNumber(product.saleRate);
    // #region agent log
    fetch('http://127.0.0.1:7653/ingest/8527ae0c-cbc0-4ad4-8c36-67cc03d92a10',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a50ee'},body:JSON.stringify({sessionId:'1a50ee',runId:'batch-price-check',hypothesisId:'A',location:'purchase-form.tsx:addItem',message:'catalog line added',data:{productId:product.id,name:product.name,batchNumber:batch?.batchNumber??'',purchaseRate:batch?.rate??toNumber(product.purchaseRate),saleRate:nextSaleRate,hasProductSaleRate:product.saleRate!=null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setItems((prev) => [
      ...prev,
      {
        id: `p-${product.id}-${Date.now()}`,
        product,
        name: product.name,
        qty: wholeQty,
        rate: batch?.rate ?? toNumber(product.purchaseRate),
        discountType: "percent",
        discountValue: 0,
        batchNumber: batch?.batchNumber ?? "",
        expiryDate: batch?.expiryDate ?? product.expiryDate ?? "",
        saleRate: nextSaleRate,
      },
    ]);
    setQuery("");
    setResults([]);
  };

  const addBatchRow = (row: ProductBatchSearchResult) => {
    const product = {
      id: row.productId,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      hsnCode: row.hsnCode,
      gstRate: row.gstRate,
      saleRate: row.saleRate,
      wholesaleRate: row.wholesaleRate,
      purchaseRate: row.purchaseRate,
      stockQty: row.productStockQty,
      expiryDate: row.batchExpiry,
    } as Product;
    addItem(product, 1, {
      batchNumber: row.batchNumber ?? "",
      expiryDate: row.batchExpiry ?? "",
      rate: toNumber(row.batchPurchaseRate ?? row.purchaseRate),
      saleRate: toNumber(row.batchSaleRate ?? row.saleRate),
    });
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
    const qty = Math.max(1, Math.round(parseFloat(customQty) || 0));
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
        gstRate: Number.isFinite(parseFloat(customGst)) ? parseFloat(customGst) : 0,
        saleRate: parseFloat(customSaleRate) || rate,
        batchNumber: "OPENING",
      },
    ]);

    // Reset
    setCustomNameField("");
    setCustomHsn("");
    setCustomQty("1");
    setCustomRate("");
    setCustomSaleRate("");
    setCustomGst("0");
    setCustomDiscVal("0");
    setShowCustomForm(false);
  };

  const updateItem = (
    id: string,
    field: "qty" | "rate" | "discountValue" | "saleRate",
    value: number,
    discountType?: "percent" | "value"
  ) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        if (field === "qty") {
          return { ...i, qty: Math.max(1, Math.round(value) || 1) };
        }
        const updated = { ...i, [field]: value };
        if (discountType !== undefined) {
          updated.discountType = discountType;
        }
        // #region agent log
        if (field === "saleRate") {
          fetch('http://127.0.0.1:7653/ingest/8527ae0c-cbc0-4ad4-8c36-67cc03d92a10',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a50ee'},body:JSON.stringify({sessionId:'1a50ee',runId:'batch-price-check',hypothesisId:'D',location:'purchase-form.tsx:updateItem',message:'sale rate edited',data:{id:i.id,name:i.name,batchNumber:i.batchNumber??'',saleRate:value,purchaseRate:i.rate},timestamp:Date.now()})}).catch(()=>{});
        }
        // #endregion
        return updated;
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
    const missingBatch = items.find(
      (i) => i.product && !i.batchNumber?.trim()
    );
    if (missingBatch) {
      setError(
        `Batch number is required for "${missingBatch.name}". Same product can have multiple batches.`
      );
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const payloadItems = items.map((i) => ({
            productId: i.product ? i.product.id : undefined,
            customName: i.product ? undefined : i.name,
            hsnCode: i.product ? (i.product.hsnCode || null) : i.hsnCode,
            qty: i.qty,
            rate: i.rate,
            discountType: i.discountType,
            discountValue: i.discountValue,
            batchNumber: i.batchNumber?.trim() || undefined,
            expiryDate: i.expiryDate?.trim() || undefined,
            gstRate: i.gstRate ?? 0,
            saleRate: i.saleRate,
          }));
        // #region agent log
        fetch('http://127.0.0.1:7653/ingest/8527ae0c-cbc0-4ad4-8c36-67cc03d92a10',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a50ee'},body:JSON.stringify({sessionId:'1a50ee',runId:'batch-price-check',hypothesisId:'B',location:'purchase-form.tsx:submit',message:'submit payload sale/batch fields',data:{lines:payloadItems.map((p)=>({productId:p.productId,batchNumber:p.batchNumber,rate:p.rate,saleRate:p.saleRate,saleRateType:typeof p.saleRate}))},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        await createPurchase({
          supplierId: parseInt(supplierId, 10),
          invoiceNo: invoiceNo || undefined,
          date: invoiceDate,
          paymentType,
          handlingCharges: parseFloat(handlingCharges) || 0,
          paidAmount: paymentType === "cash" ? undefined : (parseFloat(paidAmount) || 0),
          items: payloadItems,
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
            <Label>Invoice Date</Label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              required
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
            integerQty
            autoFocus={false}
            onProductScanned={(product, qty) =>
              addItem(product, Math.max(1, Math.round(qty) || 1))
            }
            placeholder="Scan QR / barcode to add stock items"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs">Search Product</Label>
              <div className="relative">
                <Input
                  placeholder="Or search products by name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pr-9"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-emerald-600" />
                )}
              </div>
              {isSearching && query.trim() && results.length === 0 && (
                <p className="text-xs text-slate-500">Searching products…</p>
              )}
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
                    min="1"
                    step="1"
                    inputMode="numeric"
                    className="h-9 bg-white"
                    value={customQty}
                    onChange={(e) =>
                      setCustomQty(String(Math.max(1, parseInt(e.target.value, 10) || 1)))
                    }
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
                <div>
                  <Label className="text-xs">Sale Rate</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-9 bg-white"
                    placeholder="Defaults to purchase rate"
                    value={customSaleRate}
                    onChange={(e) => setCustomSaleRate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">GST %</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    value={customGst}
                    onChange={(e) => setCustomGst(e.target.value)}
                  >
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
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
            <ProductBatchSearchResults
              results={results}
              rateMode="purchase"
              onSelect={addBatchRow}
            />
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="space-y-2 rounded-lg border bg-white p-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="min-w-0 flex-1 text-sm font-medium text-slate-800">
                      {item.name}
                      {item.product === null && (
                        <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">
                          Manual {item.hsnCode ? `(HSN: ${item.hsnCode})` : ""}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] text-slate-400">Qty</Label>
                      <Input
                        type="number"
                        className="h-8 w-20 text-xs"
                        value={item.qty}
                        min={1}
                        step={1}
                        inputMode="numeric"
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "qty",
                            parseInt(e.target.value, 10) || 1
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] text-slate-400">
                        Purchase Rate
                      </Label>
                      <Input
                        type="number"
                        className="h-8 w-24 text-xs"
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
                      <Label className="text-[10px] text-slate-400">
                        Sale Rate
                      </Label>
                      <Input
                        type="number"
                        className="h-8 w-24 text-xs"
                        value={item.saleRate ?? ""}
                        min={0}
                        step={0.01}
                        placeholder="Sell @"
                        onChange={(e) =>
                          updateItem(
                            item.id,
                            "saleRate",
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
                      {formatCurrency(
                        calculateLineAmount(
                          item.qty,
                          item.rate,
                          item.discountValue,
                          item.discountType
                        )
                      )}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                  {item.product ? (
                    <div className="grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-3">
                      <div className="sm:col-span-1">
                        <Label className="text-[10px] text-slate-400">
                          Product
                        </Label>
                        <p className="mt-0.5 truncate text-xs font-medium text-slate-700">
                          {item.name}
                        </p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400">
                          Batch No. *
                        </Label>
                        <Input
                          className="mt-0.5 h-8 font-mono text-xs uppercase"
                          value={item.batchNumber ?? ""}
                          placeholder="e.g. LOT-JUL-01"
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.id === item.id
                                  ? {
                                      ...i,
                                      batchNumber: e.target.value.toUpperCase(),
                                    }
                                  : i
                              )
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-400">
                          Batch Expiry
                        </Label>
                        <Input
                          type="date"
                          className="mt-0.5 h-8 text-xs"
                          value={item.expiryDate ?? ""}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i) =>
                                i.id === item.id
                                  ? { ...i, expiryDate: e.target.value }
                                  : i
                              )
                            )
                          }
                        />
                      </div>
                    </div>
                  ) : null}
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
