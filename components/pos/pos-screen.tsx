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
  id: string;
  product?: Product | null;
  name: string;
  qty: number;
  rate: number;
  gstRate: number;
  discountType: "percent" | "value";
  discountValue: number;
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

  // Custom Item Form State
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomNameField] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customRate, setCustomRate] = useState("");
  const [customGst, setCustomGst] = useState("18");
  const [customDiscType, setCustomDiscType] = useState<"percent" | "value">("percent");
  const [customDiscVal, setCustomDiscVal] = useState("0");

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

  const addToCart = useCallback(
    (product: Product, qty = 1) => {
      setCart((prev) => {
        const id = `p-${product.id}`;
        const existing = prev.find((c) => c.id === id);
        if (existing) {
          return prev.map((c) =>
            c.id === id ? { ...c, qty: c.qty + qty } : c
          );
        }
        const rate = getProductRate(product, billType);
        return [
          ...prev,
          {
            id,
            product,
            name: product.name,
            qty,
            rate,
            gstRate: toNumber(product.gstRate),
            discountType: "percent",
            discountValue: 0,
          },
        ];
      });
      setQuery("");
      setResults([]);
      searchRef.current?.focus();
    },
    [billType]
  );

  const addCustomItem = () => {
    if (!customName.trim() || !customQty || !customRate) return;
    const qty = parseFloat(customQty) || 0;
    const rate = parseFloat(customRate) || 0;
    const gstRate = parseFloat(customGst) || 0;
    const discountValue = parseFloat(customDiscVal) || 0;
    if (qty <= 0 || rate < 0) return;

    setCart((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        product: null,
        name: customName.trim(),
        qty,
        rate,
        gstRate,
        discountType: customDiscType,
        discountValue,
      },
    ]);

    // Reset fields
    setCustomNameField("");
    setCustomQty("1");
    setCustomRate("");
    setCustomDiscVal("0");
    setShowCustomForm(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      addToCart(results[0]);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c
        )
        .filter((c) => c.qty > 0)
    );
  };

  const updateLineDiscount = (id: string, discountValue: number, discountType: "percent" | "value") => {
    setCart((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, discountValue, discountType } : c
      )
    );
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const gst = calculateGstBreakdown(
    cart.map((c) => ({
      qty: c.qty,
      rate: c.rate,
      gstRate: c.gstRate,
      discountType: c.discountType,
      discountValue: c.discountValue,
    })),
    { billDiscount: parseFloat(billDiscount) || 0 }
  );

  const completeSale = () => {
    if (cart.length === 0) return;
    if (paymentMode === "credit" && (!customerId || customerId === "none")) {
      setError("Customer registration required for credit transactions.");
      return;
    }
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
            productId: c.product ? c.product.id : undefined,
            customName: c.product ? undefined : c.name,
            qty: c.qty,
            rate: c.rate,
            gstRate: c.gstRate,
            discountType: c.discountType,
            discountValue: c.discountValue,
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
          <div className="flex rounded-lg border border-slate-200 p-1 bg-white shadow-sm">
            {(["retail", "wholesale"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setBillType(type)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  billType === type
                    ? "bg-emerald-600 text-white shadow-sm"
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
                    {formatCurrency(getProductRate(product, billType))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Scan className="h-4 w-4" />
            Scan QR to add · type to search · Enter to pick first result
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustomForm(!showCustomForm)}
            className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-semibold"
          >
            {showCustomForm ? "Hide Manual Entry" : "Manual Entry Form"}
          </Button>
        </div>

        {showCustomForm && (
          <Card className="border-dashed border-emerald-300 bg-emerald-50/30">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-slate-800">
                Add Product Manually (Custom Item)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">Product Name</Label>
                <Input
                  className="h-9 bg-white"
                  placeholder="Enter product name..."
                  value={customName}
                  onChange={(e) => setCustomNameField(e.target.value)}
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
                <Label className="text-xs">Price / Rate (Excl. Tax)</Label>
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
                <Label className="text-xs">GST Rate %</Label>
                <select
                  value={customGst}
                  onChange={(e) => setCustomGst(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                >
                  <option value="0">0%</option>
                  <option value="5">5% (Seeds / Fertilizers)</option>
                  <option value="12">12% (Sprayers / Pumps)</option>
                  <option value="18">18% (General Agro)</option>
                  <option value="28">28% (Machinery)</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <div className="flex-1">
                  <Label className="text-xs">Discount</Label>
                  <div className="flex h-9 items-center rounded-md border border-slate-200 bg-white">
                    <select
                      value={customDiscType}
                      onChange={(e) => setCustomDiscType(e.target.value as "percent" | "value")}
                      className="h-full rounded-l-md border-r border-slate-200 bg-slate-50 px-1.5 text-xs focus:outline-none"
                    >
                      <option value="percent">%</option>
                      <option value="value">₹</option>
                    </select>
                    <input
                      type="number"
                      value={customDiscVal}
                      onChange={(e) => setCustomDiscVal(e.target.value)}
                      className="h-full w-full rounded-r-md px-2 text-sm focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 md:col-span-3 flex justify-end pt-1">
                <Button size="sm" onClick={addCustomItem} className="bg-emerald-600 hover:bg-emerald-700">
                  Add Item to Bill
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
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
              <div className="max-h-64 space-y-2 overflow-auto">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-100 p-2.5 bg-white shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium text-slate-800">
                        {item.name}
                        {item.product === null && (
                          <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold text-emerald-700 uppercase">
                            Manual
                          </span>
                        )}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrency(
                          calculateLineAmount(
                            item.qty,
                            item.rate,
                            item.discountValue,
                            item.discountType
                          )
                        )}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateQty(item.id, -1)}
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
                        onClick={() => updateQty(item.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      
                      <div className="flex h-7 items-center rounded border border-slate-200 bg-white">
                        <select
                          value={item.discountType}
                          onChange={(e) =>
                            updateLineDiscount(
                              item.id,
                              item.discountValue,
                              e.target.value as "percent" | "value"
                            )
                          }
                          className="h-full border-r border-slate-200 bg-slate-50 px-1 text-[10px] font-semibold text-slate-600 focus:outline-none"
                        >
                          <option value="percent">%</option>
                          <option value="value">₹</option>
                        </select>
                        <input
                          type="number"
                          value={item.discountValue || ""}
                          min={0}
                          onChange={(e) =>
                            updateLineDiscount(
                              item.id,
                              parseFloat(e.target.value) || 0,
                              item.discountType
                            )
                          }
                          className="h-full w-14 px-1 text-center text-xs focus:outline-none"
                          placeholder="Disc"
                        />
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto h-7 w-7"
                        onClick={() => removeItem(item.id)}
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
                <Label className="text-xs text-slate-600 font-medium">Customer</Label>
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
                  <Label className="text-xs text-slate-600 font-medium">Payment</Label>
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
                      <SelectItem value="credit" disabled={customerId === "none"}>
                        Credit (Registered Only)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-600 font-medium">Bill Discount ₹</Label>
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
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 font-medium">
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
