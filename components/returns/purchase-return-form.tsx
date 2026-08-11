"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { searchProductBatches } from "@/lib/actions/products";
import { createPurchaseReturn } from "@/lib/actions/billing";
import { searchPurchasesForReturn } from "@/lib/actions/purchases";
import { calculateGstBreakdown, calculateLineAmount } from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Supplier, Product } from "@/db/schema";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
import type { PurchaseInvoiceOption } from "@/lib/queries/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductBatchSearchResults } from "@/components/products/product-batch-search-results";
import { useRouter } from "next/navigation";

type LineItem = {
  id: string;
  product: Product | null;
  name: string;
  qty: number;
  rate: number;
  gstRate: number;
  hsnCode?: string;
};

export function PurchaseReturnForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [invoiceResults, setInvoiceResults] = useState<PurchaseInvoiceOption[]>(
    []
  );
  const [selectedInvoice, setSelectedInvoice] =
    useState<PurchaseInvoiceOption | null>(null);
  const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false);

  // Custom Item Form State
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomNameField] = useState("");
  const [customHsn, setCustomHsn] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customRate, setCustomRate] = useState("");
  const [customGstRate, setCustomGstRate] = useState("18");

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim())
        setResults(await searchProductBatches(query, 15, { onlyInStock: false }));
      else setResults([]);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (selectedInvoice) return;
    if (!supplierId) {
      setInvoiceResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const rows = await searchPurchasesForReturn(invoiceQuery, {
        supplierId: parseInt(supplierId, 10),
        limit: 15,
      });
      setInvoiceResults(rows);
    }, 250);
    return () => clearTimeout(t);
  }, [invoiceQuery, supplierId, selectedInvoice]);

  const clearInvoice = () => {
    setSelectedInvoice(null);
    setInvoiceQuery("");
    setInvoiceResults([]);
    setIsInvoiceDropdownOpen(false);
  };

  const pickInvoice = (inv: PurchaseInvoiceOption) => {
    setSelectedInvoice(inv);
    setInvoiceQuery(inv.invoiceNo ?? "");
    setIsInvoiceDropdownOpen(false);
    setSupplierId(String(inv.supplierId));
  };

  const addItem = (p: Product) => {
    if (!p.hsnCode || !p.hsnCode.trim()) {
      alert(
        `HSN code is mandatory. Product "${p.name}" lacks an HSN code. Please update the product in Inventory first.`
      );
      return;
    }
    const id = `p-${p.id}`;
    if (items.some((i) => i.id === id)) return;
    setItems((prev) => [
      ...prev,
      {
        id,
        product: p,
        name: p.name,
        qty: 1,
        rate: toNumber(p.purchaseRate),
        gstRate: toNumber(p.gstRate),
      },
    ]);
    setQuery("");
    setResults([]);
  };

  const addBatchRow = (row: ProductBatchSearchResult) => {
    addItem({
      id: row.productId,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      hsnCode: row.hsnCode,
      gstRate: row.gstRate,
      saleRate: row.saleRate,
      wholesaleRate: row.wholesaleRate,
      purchaseRate: row.batchPurchaseRate ?? row.purchaseRate,
      stockQty: row.productStockQty,
    } as Product);
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
    const gstRate = parseFloat(customGstRate) || 0;
    if (qty <= 0 || rate < 0) return;

    setItems((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        product: null,
        name: customName.trim(),
        qty,
        rate,
        gstRate,
        hsnCode: customHsn.trim(),
      },
    ]);
    setCustomNameField("");
    setCustomHsn("");
    setCustomQty("1");
    setCustomRate("");
    setCustomGstRate("18");
    setShowCustom(false);
  };

  const gst = useMemo(
    () =>
      calculateGstBreakdown(
        items.map((i) => ({
          qty: i.qty,
          rate: i.rate,
          gstRate: i.gstRate,
        }))
      ),
    [items]
  );

  const submit = () => {
    if (!supplierId || items.length === 0) return;
    startTransition(async () => {
      await createPurchaseReturn({
        purchaseId: selectedInvoice?.id,
        supplierId: parseInt(supplierId, 10),
        reason: reason || undefined,
        items: items.map((i) => ({
          productId: i.product ? i.product.id : undefined,
          customName: i.product ? undefined : i.name,
          hsnCode: i.product ? i.product.hsnCode || null : i.hsnCode,
          qty: i.qty,
          rate: i.rate,
          gstRate: i.gstRate,
        })),
      });
      setItems([]);
      setReason("");
      setSupplierId("");
      clearInvoice();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Supplier</Label>
          <Select
            value={supplierId}
            onValueChange={(value) => {
              setSupplierId(value);
              if (selectedInvoice && String(selectedInvoice.supplierId) !== value) {
                clearInvoice();
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Supplier" />
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
        <div>
          <Label>Reason</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Excess stock, damaged goods, rate dispute, etc."
          />
        </div>
      </div>

      <div>
        <Label>Against Purchase (original bill)</Label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9 pr-9"
            placeholder={
              supplierId
                ? "Search purchase invoice no..."
                : "Select a supplier first..."
            }
            disabled={!supplierId}
            value={
              selectedInvoice && !isInvoiceDropdownOpen
                ? `${selectedInvoice.invoiceNo ?? "No invoice"} — ${selectedInvoice.supplierName}`
                : invoiceQuery
            }
            onChange={(e) => {
              setInvoiceQuery(e.target.value);
              setSelectedInvoice(null);
              setIsInvoiceDropdownOpen(true);
            }}
            onFocus={() => {
              if (!supplierId) return;
              setIsInvoiceDropdownOpen(true);
              if (selectedInvoice) {
                setInvoiceQuery(selectedInvoice.invoiceNo ?? "");
              }
            }}
          />
          {(selectedInvoice || invoiceQuery) && (
            <button
              type="button"
              className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={clearInvoice}
              title="Clear purchase"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isInvoiceDropdownOpen && supplierId && (
            <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
              {invoiceResults.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-400">
                  No purchases found
                </p>
              ) : (
                invoiceResults.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => pickInvoice(inv)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-emerald-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">
                        {inv.invoiceNo || "No invoice no."}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {inv.supplierName} ·{" "}
                        {new Date(inv.date).toLocaleDateString("en-IN")}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-slate-700">
                      {formatCurrency(inv.grandTotal)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Select the original purchase so the debit note print shows “Against
          Invoice No”
        </p>
      </div>

      <div className="relative">
        <Input
          placeholder="Search registered product to return..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full">
            <ProductBatchSearchResults
              results={results}
              rateMode="purchase"
              onSelect={addBatchRow}
            />
          </div>
        )}
      </div>

      <div className="flex justify-between items-center text-xs text-slate-500">
        <span>Type to search registered items</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCustom(!showCustom)}
          className="h-7 text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
        >
          {showCustom ? "Hide Manual Item" : "Or Add Custom Manual Item"}
        </Button>
      </div>

      {showCustom && (
        <Card className="border border-dashed border-slate-300 bg-slate-50/50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Product Name *</Label>
              <Input
                className="h-9 bg-white"
                placeholder="Custom product name..."
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
            <div>
              <Label className="text-xs">GST %</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-9 bg-white"
                value={customGstRate}
                onChange={(e) => setCustomGstRate(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button
                size="sm"
                onClick={addCustomItem}
                className="bg-emerald-600 hover:bg-emerald-700 h-9"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Custom Item to Return
              </Button>
            </div>
          </div>
        </Card>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-lg border p-3 bg-white shadow-sm"
        >
          <span className="flex-1 text-sm font-medium text-slate-800">
            {item.name}
            {item.product === null && (
              <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold text-emerald-700 uppercase">
                Manual {item.hsnCode ? `(HSN: ${item.hsnCode})` : ""}
              </span>
            )}
            <span className="ml-1.5 text-[10px] text-slate-400">
              GST {item.gstRate}%
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-slate-400">Qty</Label>
            <Input
              type="number"
              className="w-20 h-8 text-xs"
              value={item.qty}
              min={0.01}
              step={0.01}
              onChange={(e) =>
                setItems((prev) =>
                  prev.map((i) =>
                    i.id === item.id
                      ? { ...i, qty: parseFloat(e.target.value) || 0 }
                      : i
                  )
                )
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-slate-400">Rate</Label>
            <Input
              type="number"
              className="w-24 h-8 text-xs"
              value={item.rate}
              onChange={(e) =>
                setItems((prev) =>
                  prev.map((i) =>
                    i.id === item.id
                      ? { ...i, rate: parseFloat(e.target.value) || 0 }
                      : i
                  )
                )
              }
            />
          </div>
          <span className="w-24 text-right text-sm font-semibold text-slate-900">
            {formatCurrency(calculateLineAmount(item.qty, item.rate))}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() =>
              setItems((prev) => prev.filter((i) => i.id !== item.id))
            }
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ))}

      {items.length > 0 && (
        <div className="space-y-3 border-t pt-3">
          <div className="ml-auto w-64 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(gst.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>CGST</span>
              <span>{formatCurrency(gst.cgst)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>SGST</span>
              <span>{formatCurrency(gst.sgst)}</span>
            </div>
            {gst.igst > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>IGST</span>
                <span>{formatCurrency(gst.igst)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Debit Note Total</span>
              <span>{formatCurrency(gst.grandTotal)}</span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={isPending || !supplierId}
              onClick={submit}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isPending ? "Saving..." : "Save Debit Note"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
