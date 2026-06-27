"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { searchProducts } from "@/lib/actions/products";
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
import { useRouter } from "next/navigation";

type LineItem = {
  product: Product;
  qty: number;
  rate: number;
};

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

  const addItem = (product: Product) => {
    setItems((prev) => {
      if (prev.some((i) => i.product.id === product.id)) return prev;
      return [
        ...prev,
        { product, qty: 1, rate: toNumber(product.purchaseRate) },
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
          <Input
            placeholder="Search products to add..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
