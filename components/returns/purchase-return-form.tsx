"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { searchProducts } from "@/lib/actions/products";
import { createPurchaseReturn } from "@/lib/actions/billing";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Supplier, Product } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";

type LineItem = { id: string; product: Product | null; name: string; qty: number; rate: number; hsnCode?: string };

export function PurchaseReturnForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [isPending, startTransition] = useTransition();

  // Custom Item Form State
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomNameField] = useState("");
  const [customHsn, setCustomHsn] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customRate, setCustomRate] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim()) setResults(await searchProducts(query, 10));
      else setResults([]);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const addItem = (p: Product) => {
    if (!p.hsnCode || !p.hsnCode.trim()) {
      alert(`HSN code is mandatory. Product "${p.name}" lacks an HSN code. Please update the product in Inventory first.`);
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
      },
    ]);
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
    if (qty <= 0 || rate < 0) return;

    setItems((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        product: null,
        name: customName.trim(),
        qty,
        rate,
        hsnCode: customHsn.trim(),
      },
    ]);
    setCustomNameField("");
    setCustomHsn("");
    setCustomQty("1");
    setCustomRate("");
    setShowCustom(false);
  };

  const total = items.reduce((s, i) => s + (i.qty * i.rate), 0);

  const submit = () => {
    if (!supplierId || items.length === 0) return;
    startTransition(async () => {
      await createPurchaseReturn({
        supplierId: parseInt(supplierId, 10),
        reason: reason || undefined,
        items: items.map((i) => ({
          productId: i.product ? i.product.id : undefined,
          customName: i.product ? undefined : i.name,
          hsnCode: i.product ? (i.product.hsnCode || null) : i.hsnCode,
          qty: i.qty,
          rate: i.rate,
        })),
      });
      setItems([]);
      setReason("");
      setSupplierId("");
      router.refresh();
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

      <div className="relative">
        <Input
          placeholder="Search registered product to return..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between border-b px-4 py-2 hover:bg-slate-50 text-left text-sm"
                onClick={() => addItem(p)}
              >
                <span>{p.name}</span>
                <Plus className="h-4 w-4 text-emerald-600" />
              </button>
            ))}
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
            <div className="sm:col-span-2 flex items-end">
              <Button size="sm" onClick={addCustomItem} className="bg-emerald-600 hover:bg-emerald-700 h-9">
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
            {formatCurrency(item.qty * item.rate)}
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
        <div className="flex items-center justify-between border-t pt-3 font-semibold text-sm">
          <span>Debit Note Total: {formatCurrency(total)}</span>
          <Button disabled={isPending || !supplierId} onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
            {isPending ? "Saving..." : "Save Debit Note"}
          </Button>
        </div>
      )}
    </div>
  );
}
