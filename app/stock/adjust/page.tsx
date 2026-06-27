"use client";

import { useEffect, useState, useTransition } from "react";
import { searchProducts } from "@/lib/actions/products";
import { adjustStock, isInventoryPinRequired, verifyInventoryAdminPin } from "@/lib/actions/billing";
import type { Product } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export default function StockAdjustPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [qtyDelta, setQtyDelta] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim()) setResults(await searchProducts(query, 8));
      else setResults([]);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const submit = () => {
    if (!selected || !qtyDelta) return;
    startTransition(async () => {
      try {
        const pinRequired = await isInventoryPinRequired();
        if (pinRequired) {
          const pin = window.prompt("Enter Supervisor/Admin PIN to adjust stock quantity:");
          if (pin === null) return;
          const valid = await verifyInventoryAdminPin(pin);
          if (!valid) {
            alert("Incorrect PIN. Access denied.");
            return;
          }
        }
        await adjustStock(selected.id, parseFloat(qtyDelta), notes || "Manual adjustment");
        router.push("/stock");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to adjust stock");
      }
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Adjustment</h1>
        <p className="text-sm text-slate-500">
          Add or remove stock without purchase/sale
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adjust Quantity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search product..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && !selected && (
            <div className="rounded-lg border">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full border-b px-4 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    setSelected(p);
                    setQuery(p.name);
                    setResults([]);
                  }}
                >
                  {p.name} — Stock: {p.stockQty}
                </button>
              ))}
            </div>
          )}
          {selected && (
            <p className="text-sm font-medium text-emerald-700">
              Selected: {selected.name} (Current: {selected.stockQty})
            </p>
          )}
          <div>
            <Label>Qty Change (+ add, − remove)</Label>
            <Input
              type="number"
              step="0.01"
              value={qtyDelta}
              onChange={(e) => setQtyDelta(e.target.value)}
              placeholder="e.g. 10 or -5"
            />
          </div>
          <div>
            <Label>Reason</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Physical count, damage, etc."
            />
          </div>
          <Button
            className="w-full"
            disabled={!selected || !qtyDelta || isPending}
            onClick={submit}
          >
            {isPending ? "Saving..." : "Apply Adjustment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
