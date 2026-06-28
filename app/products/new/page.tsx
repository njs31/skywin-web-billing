"use client";

import { useState, useTransition } from "react";
import { createProduct } from "@/lib/actions/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewProductPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [purchaseRate, setPurchaseRate] = useState("");
  const [saleRate, setSaleRate] = useState("");
  const [wholesaleRate, setWholesaleRate] = useState("");
  const [mrp, setMrp] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [stockQty, setStockQty] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("10");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Product name is required");
      return;
    }

    startTransition(async () => {
      try {
        await createProduct({
          name: name.trim(),
          barcode: barcode.trim() || undefined,
          purchaseRate: parseFloat(purchaseRate) || 0,
          saleRate: parseFloat(saleRate) || 0,
          wholesaleRate: wholesaleRate ? parseFloat(wholesaleRate) : undefined,
          mrp: mrp ? parseFloat(mrp) : undefined,
          hsnCode: hsnCode.trim(), // Send as-is, zod will validate if empty!
          gstRate: parseFloat(gstRate) || 18,
          stockQty: parseFloat(stockQty) || 0,
          reorderLevel: parseFloat(reorderLevel) || 10,
          unit: "pcs",
        });
        router.push("/products");
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to create product");
        }
      }
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/products">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add New Product</h1>
          <p className="text-sm text-slate-500">Register a new product in the system</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter product name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="barcode">Barcode / Scan Code (optional)</Label>
                <Input
                  id="barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or enter code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hsnCode">HSN Code *</Label>
                <Input
                  id="hsnCode"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  placeholder="Mandatory GST HSN Code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchaseRate">Purchase Rate (₹) *</Label>
                <Input
                  id="purchaseRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseRate}
                  onChange={(e) => setPurchaseRate(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="saleRate">Sale Rate (₹) *</Label>
                <Input
                  id="saleRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={saleRate}
                  onChange={(e) => setSaleRate(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wholesaleRate">Wholesale Rate (₹, optional)</Label>
                <Input
                  id="wholesaleRate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={wholesaleRate}
                  onChange={(e) => setWholesaleRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mrp">MRP (₹, optional)</Label>
                <Input
                  id="mrp"
                  type="number"
                  step="0.01"
                  min="0"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gstRate">GST Rate (%)</Label>
                <select
                  id="gstRate"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stockQty">Opening Stock Quantity</Label>
                <Input
                  id="stockQty"
                  type="number"
                  step="0.01"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
              {isPending ? "Creating..." : "Create Product"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
