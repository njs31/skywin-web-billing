"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { searchProductBatches } from "@/lib/actions/products";
import { createQuotation } from "@/lib/actions/quotations";
import {
  applyRupeeRounding,
  calculateGstBreakdown,
  calculateLineAmount,
  getProductRate,
} from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Customer, Product } from "@/db/schema";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
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
import { ProductBatchSearchResults } from "@/components/products/product-batch-search-results";
import { useRouter } from "next/navigation";

type LineItem = {
  id: string;
  product: Product | null;
  name: string;
  qty: number;
  rate: number;
  gstRate: number;
  discountPercent: number;
  hsnCode?: string;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function QuotationForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("IMMEDIATE");
  const [dispatchedThrough, setDispatchedThrough] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

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
        rate: getProductRate(p, "wholesale"),
        gstRate: toNumber(p.gstRate),
        discountPercent: 0,
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

  const gst = useMemo(
    () =>
      applyRupeeRounding(
        calculateGstBreakdown(
          items.map((i) => ({
            qty: i.qty,
            rate: i.rate,
            gstRate: i.gstRate,
            discountType: "percent" as const,
            discountValue: i.discountPercent,
          }))
        )
      ),
    [items]
  );

  const submit = () => {
    if (!customerId || items.length === 0) {
      setError("Select a customer and add at least one item.");
      return;
    }
    const customer = customers.find((c) => c.id === parseInt(customerId, 10));
    setError("");
    startTransition(async () => {
      try {
        const quote = await createQuotation({
          customerId: parseInt(customerId, 10),
          customerName: customer?.name,
          customerPhone: customer?.phone ?? undefined,
          paymentTerms: paymentTerms || undefined,
          dispatchedThrough: dispatchedThrough || undefined,
          destination: destination || undefined,
          notes: notes || undefined,
          items: items.map((i) => ({
            productId: i.product ? i.product.id : undefined,
            customName: i.product ? undefined : i.name,
            hsnCode: i.product ? i.product.hsnCode || null : i.hsnCode,
            qty: i.qty,
            rate: i.rate,
            gstRate: i.gstRate,
            discountPercent: i.discountPercent,
          })),
        });
        router.push(`/quotations/${quote.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create quotation.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select Customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                  {c.phone ? ` (${c.phone})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Mode/Terms of Payment</Label>
          <Input
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="IMMEDIATE"
          />
        </div>
        <div>
          <Label>Dispatched through</Label>
          <Input
            value={dispatchedThrough}
            onChange={(e) => setDispatchedThrough(e.target.value)}
            placeholder="e.g. ROAD"
          />
        </div>
        <div>
          <Label>Destination</Label>
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
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
              onSelect={addBatchRow}
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2">Item</th>
              <th className="p-2 w-24">Qty</th>
              <th className="p-2 w-28">Rate</th>
              <th className="p-2 w-20">GST%</th>
              <th className="p-2 w-20">Disc%</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-2 font-medium">{item.name}</td>
                <td className="p-2">
                  <Input
                    type="number"
                    className="h-8"
                    value={item.qty}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((r) =>
                          r.id === item.id
                            ? { ...r, qty: parseFloat(e.target.value) || 0 }
                            : r
                        )
                      )
                    }
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    className="h-8"
                    value={item.rate}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((r) =>
                          r.id === item.id
                            ? { ...r, rate: parseFloat(e.target.value) || 0 }
                            : r
                        )
                      )
                    }
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    className="h-8"
                    value={item.gstRate}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((r) =>
                          r.id === item.id
                            ? { ...r, gstRate: parseFloat(e.target.value) || 0 }
                            : r
                        )
                      )
                    }
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="number"
                    className="h-8"
                    value={item.discountPercent}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((r) =>
                          r.id === item.id
                            ? {
                                ...r,
                                discountPercent: parseFloat(e.target.value) || 0,
                              }
                            : r
                        )
                      )
                    }
                  />
                </td>
                <td className="p-2 text-right">
                  {formatCurrency(
                    calculateLineAmount(
                      item.qty,
                      item.rate,
                      item.discountPercent,
                      "percent"
                    )
                  )}
                </td>
                <td className="p-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      setItems((prev) => prev.filter((r) => r.id !== item.id))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-400">
                  Add products to build the quotation
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm space-y-0.5">
          <p>Subtotal: {formatCurrency(gst.subtotal)}</p>
          <p>
            CGST/SGST: {formatCurrency(gst.cgst)} / {formatCurrency(gst.sgst)}
          </p>
          {Math.abs(gst.roundOff ?? 0) >= 0.005 && (
            <p>Round Off: {formatCurrency(gst.roundOff!)}</p>
          )}
          <p className="font-semibold text-base">
            Grand Total: {formatCurrency(gst.grandTotal)}
          </p>
        </div>
        <div className="flex gap-2">
          {error && <p className="text-sm text-red-600 self-center">{error}</p>}
          <Button onClick={submit} disabled={isPending || items.length === 0}>
            <Plus className="mr-1 h-4 w-4" />
            {isPending ? "Saving…" : "Create Quotation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
