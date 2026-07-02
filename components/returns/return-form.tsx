"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { searchProducts } from "@/lib/actions/products";
import { createSaleReturn } from "@/lib/actions/billing";
import { calculateLineAmount } from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Customer, Product } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";

type LineItem = { product: Product; qty: number; rate: number };

export function ReturnForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [customerId, setCustomerId] = useState("none");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

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
    if (items.some((i) => i.product.id === p.id)) return;
    setItems((prev) => [
      ...prev,
      { product: p, qty: 1, rate: toNumber(p.saleRate) },
    ]);
    setQuery("");
    setResults([]);
  };

  const total = items.reduce(
    (s, i) => s + calculateLineAmount(i.qty, i.rate),
    0
  );

  const submit = () => {
    if (items.length === 0) return;
    startTransition(async () => {
      await createSaleReturn({
        customerId:
          customerId !== "none" ? parseInt(customerId, 10) : undefined,
        reason: reason || undefined,
        items: items.map((i) => ({
          productId: i.product.id,
          qty: i.qty,
          rate: i.rate,
          gstRate: toNumber(i.product.gstRate),
        })),
      });
      setItems([]);
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Walk-in</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
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
            placeholder="Defective, wrong item, etc."
          />
        </div>
      </div>

      <Input
        placeholder="Search product to return..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <div className="rounded-lg border">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center justify-between border-b px-4 py-2 hover:bg-slate-50"
              onClick={() => addItem(p)}
            >
              <span className="text-sm">{p.name}</span>
              <Plus className="h-4 w-4 text-emerald-600" />
            </button>
          ))}
        </div>
      )}

      {items.map((item) => (
        <div
          key={item.product.id}
          className="flex items-center gap-3 rounded-lg border p-3"
        >
          <span className="flex-1 text-sm font-medium">{item.product.name}</span>
          <Input
            type="number"
            className="w-20"
            value={item.qty}
            min={0.01}
            step={0.01}
            onChange={(e) =>
              setItems((prev) =>
                prev.map((i) =>
                  i.product.id === item.product.id
                    ? { ...i, qty: parseFloat(e.target.value) || 0 }
                    : i
                )
              )
            }
          />
          <Input
            type="number"
            className="w-24"
            value={item.rate}
            onChange={(e) =>
              setItems((prev) =>
                prev.map((i) =>
                  i.product.id === item.product.id
                    ? { ...i, rate: parseFloat(e.target.value) || 0 }
                    : i
                )
              )
            }
          />
          <span className="w-24 text-right text-sm font-semibold">
            {formatCurrency(calculateLineAmount(item.qty, item.rate))}
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() =>
              setItems((prev) =>
                prev.filter((i) => i.product.id !== item.product.id)
              )
            }
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ))}

      {items.length > 0 && (
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-bold">Return Total: {formatCurrency(total)}</span>
          <Button disabled={isPending} onClick={submit}>
            {isPending ? "Saving..." : "Save Return"}
          </Button>
        </div>
      )}
    </div>
  );
}
