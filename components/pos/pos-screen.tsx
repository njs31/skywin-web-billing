"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Minus, Plus, Search, Trash2, ShoppingBag } from "lucide-react";
import { searchProducts } from "@/lib/actions/products";
import { createSale } from "@/lib/actions/sales";
import { calculateGstBreakdown, calculateLineAmount } from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Product } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";

type CartItem = {
  product: Product;
  qty: number;
};

export function PosScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "credit">(
    "cash"
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 1) {
        const items = await searchProducts(query, 15);
        setResults(items);
      } else {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [...prev, { product, qty: 1 }];
    });
    setQuery("");
    setResults([]);
  }, []);

  const updateQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.product.id === productId
            ? { ...c, qty: Math.max(0, c.qty + delta) }
            : c
        )
        .filter((c) => c.qty > 0)
    );
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  };

  const gst = calculateGstBreakdown(
    cart.map((c) => ({
      qty: c.qty,
      rate: toNumber(c.product.saleRate),
      gstRate: toNumber(c.product.gstRate),
    }))
  );

  const completeSale = () => {
    if (cart.length === 0) return;
    setError("");
    startTransition(async () => {
      try {
        const sale = await createSale({
          customerName: customerName || undefined,
          paymentMode,
          items: cart.map((c) => ({
            productId: c.product.id,
            qty: c.qty,
            rate: toNumber(c.product.saleRate),
            gstRate: toNumber(c.product.gstRate),
          })),
        });
        setCart([]);
        setCustomerName("");
        router.push(`/invoices/${sale.id}?print=1`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete sale");
      }
    });
  };

  return (
    <div className="grid h-full grid-cols-1 gap-6 p-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">POS Billing</h1>
          <p className="text-sm text-slate-500">
            Search products and add to cart
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            className="pl-10 text-base"
            placeholder="Search by product name, SKU, or barcode..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left hover:bg-emerald-50"
                  onClick={() => addToCart(product)}
                >
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-xs text-slate-500">
                      Stock: {toNumber(product.stockQty)} | GST:{" "}
                      {toNumber(product.gstRate)}%
                    </p>
                  </div>
                  <span className="font-semibold text-emerald-700">
                    {formatCurrency(product.saleRate)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Tips</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">
            Type to search from 1,000+ agri products. Click a result to add to
            cart. Use +/- to adjust quantity.
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card className="sticky top-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              Cart ({cart.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Cart is empty. Search and add products.
              </p>
            ) : (
              <div className="max-h-64 space-y-3 overflow-auto">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatCurrency(item.product.saleRate)} each
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => updateQty(item.product.id, -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold">
                          {item.qty}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => updateQty(item.product.id, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500"
                          onClick={() => removeItem(item.product.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatCurrency(
                        calculateLineAmount(
                          item.qty,
                          toNumber(item.product.saleRate)
                        )
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{formatCurrency(gst.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CGST</span>
                <span>{formatCurrency(gst.cgst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">SGST</span>
                <span>{formatCurrency(gst.sgst)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-emerald-700">
                  {formatCurrency(gst.grandTotal)}
                </span>
              </div>
            </div>

            <Input
              placeholder="Customer name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />

            <Select
              value={paymentMode}
              onValueChange={(v) =>
                setPaymentMode(v as "cash" | "upi" | "credit")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Payment mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectContent>
            </Select>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0 || isPending}
              onClick={completeSale}
            >
              {isPending ? "Processing..." : "Complete Sale"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
