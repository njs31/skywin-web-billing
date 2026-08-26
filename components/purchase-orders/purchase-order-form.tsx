"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { searchProductBatches } from "@/lib/actions/products";
import { createPurchaseOrder } from "@/lib/actions/purchase-orders";
import {
  applyRupeeRounding,
  calculateGstBreakdown,
  calculateLineAmount,
} from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Product, Supplier } from "@/db/schema";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
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

export function PurchaseOrderForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomNameField] = useState("");
  const [customHsn, setCustomHsn] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customRate, setCustomRate] = useState("");
  const [customGst, setCustomGst] = useState("0");

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim())
        setResults(await searchProductBatches(query, 15, { onlyInStock: false }));
      else setResults([]);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const addItem = (p: Product) => {
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
        hsnCode: p.hsnCode ?? undefined,
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
      setError("Product name, quantity, and rate are required.");
      return;
    }
    const qty = parseFloat(customQty) || 0;
    const rate = parseFloat(customRate) || 0;
    if (qty <= 0 || rate < 0) return;

    setItems((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        product: null,
        name: customName.trim(),
        qty,
        rate,
        gstRate: parseFloat(customGst) || 0,
        hsnCode: customHsn.trim() || undefined,
      },
    ]);
    setCustomNameField("");
    setCustomHsn("");
    setCustomQty("1");
    setCustomRate("");
    setCustomGst("0");
    setShowCustom(false);
    setError("");
  };

  const gstPreview = useMemo(
    () =>
      applyRupeeRounding(
        calculateGstBreakdown(
          items.map((i) => ({
            qty: i.qty,
            rate: i.rate,
            gstRate: i.gstRate,
          }))
        )
      ),
    [items]
  );

  const submit = () => {
    if (!supplierId || items.length === 0) {
      setError("Select a supplier and add at least one item.");
      return;
    }
    const supplier = suppliers.find((s) => s.id === parseInt(supplierId, 10));
    setError("");
    startTransition(async () => {
      try {
        const po = await createPurchaseOrder({
          supplierId: parseInt(supplierId, 10),
          supplierName: supplier?.name,
          notes: notes || undefined,
          items: items.map((i) => ({
            productId: i.product ? i.product.id : undefined,
            customName: i.product ? undefined : i.name,
            hsnCode: i.product ? i.product.hsnCode || null : i.hsnCode,
            qty: i.qty,
            rate: i.rate,
            gstRate: i.gstRate,
          })),
        });
        router.push(`/purchase-orders/${po.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create PO.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="Select Supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                  {s.phone ? ` (${s.phone})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery instructions, reference, etc."
          />
        </div>
      </div>

      <div className="relative">
        <Input
          placeholder="Search products to add..."
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

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Type to search registered items</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCustom(!showCustom)}
          className="h-7 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
        >
          {showCustom ? "Hide Manual Item" : "Or Add Custom Manual Item"}
        </Button>
      </div>

      {showCustom && (
        <Card className="space-y-3 border border-dashed border-slate-300 bg-slate-50/50 p-4">
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
              <Label className="text-xs">HSN Code</Label>
              <Input
                className="h-9 bg-white"
                placeholder="Optional HSN..."
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
              <Label className="text-xs">Rate</Label>
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
                value={customGst}
                onChange={(e) => setCustomGst(e.target.value)}
              />
            </div>
            <div className="flex items-end sm:col-span-1">
              <Button
                size="sm"
                onClick={addCustomItem}
                className="h-9 bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>
          </div>
        </Card>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm"
        >
          <span className="flex-1 text-sm font-medium text-slate-800">
            {item.name}
            {item.product === null && (
              <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">
                Manual {item.hsnCode ? `(HSN: ${item.hsnCode})` : ""}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-slate-400">Qty</Label>
            <Input
              type="number"
              className="h-8 w-20 text-xs"
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
              className="h-8 w-24 text-xs"
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
          <span className="w-16 text-right text-[10px] text-slate-500">
            {item.gstRate}% GST
          </span>
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items.length > 0 && (
        <div className="space-y-3 border-t pt-3">
          <div className="ml-auto w-72 space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Taxable</span>
              <span>{formatCurrency(gstPreview.subtotal)}</span>
            </div>
            {gstPreview.igst > 0 ? (
              <div className="flex justify-between text-slate-600">
                <span>IGST</span>
                <span>{formatCurrency(gstPreview.igst)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>CGST</span>
                  <span>{formatCurrency(gstPreview.cgst)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SGST</span>
                  <span>{formatCurrency(gstPreview.sgst)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Print total (incl. GST)</span>
              <span>{formatCurrency(gstPreview.grandTotal)}</span>
            </div>
            <p className="text-[11px] font-normal text-slate-500">
              Saved PO total stays {formatCurrency(gstPreview.subtotal)} (qty ×
              rate).
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={isPending || !supplierId}
              onClick={submit}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isPending ? "Saving..." : "Create Purchase Order"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
