"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Minus,
  Plus,
  Search,
  Trash2,
  ShoppingBag,
  Scan,
} from "lucide-react";
import { searchProducts } from "@/lib/actions/products";
import { createSale } from "@/lib/actions/sales";
import {
  calculateGstBreakdown,
  calculateLineAmount,
  getProductRate,
} from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Customer, Product } from "@/db/schema";
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
import { useRouter } from "next/navigation";

type CartItem = {
  product: Product;
  qty: number;
  discountPercent: number;
};

type PosScreenProps = {
  customers: Customer[];
  defaultOperator?: string;
};

export function PosScreen({ customers, defaultOperator }: PosScreenProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billType, setBillType] = useState<"retail" | "wholesale">("retail");
  const [customerId, setCustomerId] = useState<string>("none");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<
    "cash" | "upi" | "credit" | "card" | "cheque"
  >("cash");
  const [billDiscount, setBillDiscount] = useState("");
  const [operatorName, setOperatorName] = useState(defaultOperator ?? "Counter");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 1) {
        setResults(await searchProducts(query, 15));
      } else {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const getRate = useCallback(
    (product: Product) => getProductRate(product, billType),
    [billType]
  );

  const addToCart = useCallback(
    (product: Product, qty = 1) => {
      setCart((prev) => {
        const existing = prev.find((c) => c.product.id === product.id);
        if (existing) {
          return prev.map((c) =>
            c.product.id === product.id
              ? { ...c, qty: c.qty + qty }
              : c
          );
        }
        return [...prev, { product, qty, discountPercent: 0 }];
      });
      setQuery("");
      setResults([]);
      searchRef.current?.focus();
    },
    []
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      addToCart(results[0]);
    }
  };

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

  const updateLineDiscount = (productId: number, discountPercent: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product.id === productId ? { ...c, discountPercent } : c
      )
    );
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  };

  const gst = calculateGstBreakdown(
    cart.map((c) => ({
      qty: c.qty,
      rate: getRate(c.product),
      gstRate: toNumber(c.product.gstRate),
      discountPercent: c.discountPercent,
    })),
    { billDiscount: parseFloat(billDiscount) || 0 }
  );

  const completeSale = () => {
    if (cart.length === 0) return;
    setError("");
    startTransition(async () => {
      try {
        const sale = await createSale({
          billType,
          customerId:
            customerId && customerId !== "none"
              ? parseInt(customerId, 10)
              : undefined,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          paymentMode,
          operatorName,
          discountAmount: parseFloat(billDiscount) || 0,
          items: cart.map((c) => ({
            productId: c.product.id,
            qty: c.qty,
            rate: getRate(c.product),
            gstRate: toNumber(c.product.gstRate),
            discountPercent: c.discountPercent,
          })),
        });
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setBillDiscount("");
        router.push(`/invoices/${sale.id}?print=1`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete sale");
      }
    });
  };

  return (
    <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">POS Billing</h1>
            <p className="text-sm text-slate-500">
              Retail & wholesale counter billing
            </p>
          </div>
          <div className="flex rounded-lg border border-slate-200 p-1">
            {(["retail", "wholesale"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setBillType(type)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  billType === type
                    ? "bg-emerald-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <ProductScanBar
          onProductScanned={(product, qty) => addToCart(product, qty)}
          placeholder="Scan QR / barcode — adds to cart instantly"
        />

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            ref={searchRef}
            className="pl-10 text-base"
            placeholder="Search product, SKU, or scan barcode..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left hover:bg-emerald-50"
                  onClick={() => addToCart(product)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {product.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Stock: {toNumber(product.stockQty)} | GST:{" "}
                      {toNumber(product.gstRate)}%
                      {product.barcode && ` | ${product.barcode}`}
                    </p>
                  </div>
                  <span className="ml-2 font-semibold text-emerald-700">
                    {formatCurrency(getRate(product))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Scan className="h-4 w-4" />
          Scan QR to add · type to search · Enter to pick first result
        </div>
      </div>

      <div className="lg:col-span-2">
        <Card className="sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="h-5 w-5" />
              Cart ({cart.length}) — {billType}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Cart is empty
              </p>
            ) : (
              <div className="max-h-52 space-y-2 overflow-auto">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="rounded-lg border border-slate-100 p-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium">
                        {item.product.name}
                      </p>
                      <p className="text-sm font-semibold">
                        {formatCurrency(
                          calculateLineAmount(
                            item.qty,
                            getRate(item.product),
                            item.discountPercent
                          )
                        )}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
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
                      <Input
                        type="number"
                        className="h-7 w-14 px-1 text-xs"
                        placeholder="Disc%"
                        min={0}
                        max={100}
                        value={item.discountPercent || ""}
                        onChange={(e) =>
                          updateLineDiscount(
                            item.product.id,
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto h-7 w-7"
                        onClick={() => removeItem(item.product.id)}
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{formatCurrency(gst.subtotal)}</span>
              </div>
              {gst.discountAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(gst.discountAmount)}</span>
                </div>
              )}
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

            <div className="grid gap-2">
              <div>
                <Label className="text-xs">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Walk-in customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Walk-in</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(!customerId || customerId === "none") && (
                <div className="space-y-2">
                  <Input
                    className="h-9"
                    placeholder="Customer name (optional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  <Input
                    className="h-9"
                    placeholder="Mobile number (optional)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Payment</Label>
                  <Select
                    value={paymentMode}
                    onValueChange={(v) =>
                      setPaymentMode(
                        v as "cash" | "upi" | "credit" | "card" | "cheque"
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Bill Discount ₹</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min={0}
                    value={billDiscount}
                    onChange={(e) => setBillDiscount(e.target.value)}
                  />
                </div>
              </div>
              <Input
                className="h-9"
                placeholder="Operator name"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
              />
            </div>

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
              {isPending ? "Processing..." : `Complete ${billType} Sale`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
