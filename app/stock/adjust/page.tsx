"use client";

import { useEffect, useState, useTransition } from "react";
import { searchProductBatches } from "@/lib/actions/products";
import { adjustStock, isInventoryPinRequired, verifyInventoryAdminPin } from "@/lib/actions/billing";
import type { Product } from "@/db/schema";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductBatchSearchResults } from "@/components/products/product-batch-search-results";
import { useRouter } from "next/navigation";
import { toNumber } from "@/lib/utils";

export default function StockAdjustPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedBatch, setSelectedBatch] =
    useState<ProductBatchSearchResult | null>(null);
  const [qtyDelta, setQtyDelta] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const qty = parseFloat(qtyDelta) || 0;
  const isAdd = qty > 0;

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim()) {
        setResults(
          await searchProductBatches(query, 12, { onlyInStock: false })
        );
      } else {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const pickRow = (row: ProductBatchSearchResult) => {
    setSelected({
      id: row.productId,
      name: row.name,
      stockQty: row.productStockQty,
      expiryDate: row.batchExpiry,
    } as Product);
    setSelectedBatch(row);
    setQuery(row.name);
    setResults([]);
    setBatchNumber(row.batchNumber ?? "");
    setExpiryDate(row.batchExpiry ?? "");
  };

  const submit = () => {
    if (!selected || !qtyDelta) return;
    if (isAdd && !batchNumber.trim()) {
      alert("Batch number is required when adding stock.");
      return;
    }
    startTransition(async () => {
      try {
        const pinRequired = await isInventoryPinRequired();
        if (pinRequired) {
          const pin = window.prompt(
            "Enter Supervisor/Admin PIN to adjust stock quantity:"
          );
          if (pin === null) return;
          const valid = await verifyInventoryAdminPin(pin);
          if (!valid) {
            alert("Incorrect PIN. Access denied.");
            return;
          }
        }
        await adjustStock(selected.id, qty, notes || "Manual adjustment", {
          batchNumber: batchNumber.trim() || undefined,
          expiryDate: expiryDate || null,
        });
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
          Search shows each batch separately. Add stock to a batch, or remove
          via FEFO.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adjust Quantity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search product or batch..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setSelectedBatch(null);
            }}
          />
          {results.length > 0 && !selected && (
            <ProductBatchSearchResults
              results={results}
              rateMode="purchase"
              onSelect={pickRow}
            />
          )}
          {selected && (
            <div className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-800">
              <p className="font-medium">{selected.name}</p>
              <p className="text-xs">
                Total stock: {toNumber(selected.stockQty)}
                {selectedBatch?.batchNumber
                  ? ` · Batch ${selectedBatch.batchNumber} (${toNumber(selectedBatch.batchQty)} pcs)`
                  : ""}
              </p>
            </div>
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
          {isAdd ? (
            <>
              <div>
                <Label>Batch Number *</Label>
                <Input
                  className="font-mono uppercase"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. LOT-JUL-01"
                />
              </div>
              <div>
                <Label>Batch Expiry (optional)</Label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </>
          ) : (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              Removing stock uses FEFO (oldest expiry batch first).
            </p>
          )}
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
