"use client";

import { useState, useTransition } from "react";
import { updateProduct, deleteProduct } from "@/lib/actions/products";
import { useRouter } from "next/navigation";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Product } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Pencil, Trash2, Check, X } from "lucide-react";
import { isInventoryPinRequired, verifyInventoryAdminPin } from "@/lib/actions/billing";

function formatExpiry(value: string | null | undefined) {
  if (!value) return null;
  // Stored as YYYY-MM-DD from Postgres date
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function isNearExpiry(value: string | null | undefined) {
  if (!value) return false;
  const expiry = new Date(`${value}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 90);
  return expiry >= today && expiry <= limit;
}

function isExpired(value: string | null | undefined) {
  if (!value) return false;
  const expiry = new Date(`${value}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today;
}

export function ProductTable({ products }: { products: Product[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saleRate, setSaleRate] = useState("");
  const [mrp, setMrp] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [gstRate, setGstRate] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [isPending, startTransition] = useTransition();

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setSaleRate(String(toNumber(product.saleRate)));
    setMrp(product.mrp != null ? String(toNumber(product.mrp)) : "");
    setDiscountPercent(String(toNumber(product.discountPercent)));
    setGstRate(String(toNumber(product.gstRate)));
    setHsnCode(product.hsnCode ?? "");
    setExpiryDate(product.expiryDate ?? "");
    setStockQty(String(toNumber(product.stockQty)));
  };

  const save = (id: number) => {
    if (!hsnCode.trim()) {
      alert("HSN code is mandatory.");
      return;
    }
    const parsedStock = parseFloat(stockQty);
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      alert("Stock must be a number greater than or equal to 0.");
      return;
    }
    startTransition(async () => {
      try {
        const pinRequired = await isInventoryPinRequired();
        if (pinRequired) {
          const pin = window.prompt("Enter Supervisor/Admin PIN to edit product settings:");
          if (pin === null) return;
          const valid = await verifyInventoryAdminPin(pin);
          if (!valid) {
            alert("Incorrect PIN. Access denied.");
            return;
          }
        }
        const parsedSale = parseFloat(saleRate);
        const parsedMrp = mrp.trim() === "" ? null : parseFloat(mrp);
        const parsedDisc = parseFloat(discountPercent);
        await updateProduct(id, {
          saleRate: Number.isFinite(parsedSale) ? parsedSale : 0,
          mrp: parsedMrp != null && Number.isFinite(parsedMrp) ? parsedMrp : null,
          discountPercent: Number.isFinite(parsedDisc) ? parsedDisc : 0,
          gstRate: Number.isFinite(parseFloat(gstRate)) ? parseFloat(gstRate) : 0,
          hsnCode: hsnCode.trim(),
          expiryDate: expiryDate.trim() || null,
          stockQty: parsedStock,
        });
        setEditingId(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update product");
      }
    });
  };

  const handleDelete = (product: Product) => {
    startTransition(async () => {
      try {
        const pinRequired = await isInventoryPinRequired();
        if (pinRequired) {
          const pin = window.prompt(
            `Enter Supervisor/Admin PIN to delete product "${product.name}":`
          );
          if (pin === null) return;
          const valid = await verifyInventoryAdminPin(pin);
          if (!valid) {
            alert("Incorrect PIN. Access denied.");
            return;
          }
        } else {
          if (
            !confirm(`Are you sure you want to delete product "${product.name}"?`)
          ) {
            return;
          }
        }

        await deleteProduct(product.id);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to delete product");
      }
    });
  };

  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="bg-slate-50/80">
          <TableHead className="py-2.5 px-3">Product</TableHead>
          <TableHead className="py-2.5 px-2">SKU</TableHead>
          <TableHead className="py-2.5 px-2">HSN</TableHead>
          <TableHead className="py-2.5 px-2">Expiry</TableHead>
          <TableHead className="py-2.5 px-2 text-right">Stock</TableHead>
          <TableHead className="py-2.5 px-2 text-right">Pur. Rate</TableHead>
          <TableHead className="py-2.5 px-2 text-right">Sale Rate</TableHead>
          <TableHead className="py-2.5 px-2 text-right">MRP</TableHead>
          <TableHead className="py-2.5 px-2 text-right">Disc %</TableHead>
          <TableHead className="py-2.5 px-2 text-right">GST %</TableHead>
          <TableHead className="py-2.5 px-2 text-right w-20">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => {
          const expired = isExpired(product.expiryDate);
          const nearExpiry = isNearExpiry(product.expiryDate);
          return (
            <TableRow
              key={product.id}
              className={
                toNumber(product.stockQty) < 10 ? "bg-amber-50/60" : undefined
              }
            >
              <TableCell className="max-w-[200px] font-medium truncate py-2 px-3">
                {product.name}
              </TableCell>
              <TableCell className="text-slate-500 py-2 px-2 whitespace-nowrap">
                {product.sku ?? "-"}
              </TableCell>
              <TableCell className="text-slate-700 font-mono text-xs py-2 px-2 whitespace-nowrap">
                {editingId === product.id ? (
                  <Input
                    className="w-20 h-7 text-xs px-1.5"
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
                    placeholder="HSN..."
                  />
                ) : (
                  product.hsnCode || <span className="text-red-500 font-semibold">Missing!</span>
                )}
              </TableCell>
              <TableCell className="py-2 px-2 whitespace-nowrap">
                {editingId === product.id ? (
                  <Input
                    type="date"
                    className="h-7 w-32 text-xs px-1.5"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                ) : product.expiryDate ? (
                  <span
                    className={
                      expired
                        ? "font-semibold text-red-600"
                        : nearExpiry
                          ? "font-semibold text-amber-600"
                          : "text-slate-700"
                    }
                  >
                    {formatExpiry(product.expiryDate)}
                    {expired ? " (Exp)" : nearExpiry ? " (Near)" : ""}
                  </span>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap font-medium">
                {editingId === product.id ? (
                  <Input
                    type="number"
                    className="ml-auto w-20 h-7 text-xs px-1.5 text-right"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                ) : (
                  toNumber(product.stockQty)
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap text-slate-600">
                {formatCurrency(product.purchaseRate)}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {editingId === product.id ? (
                  <Input
                    type="number"
                    className="ml-auto w-20 h-7 text-xs px-1.5 text-right"
                    value={saleRate}
                    onChange={(e) => setSaleRate(e.target.value)}
                  />
                ) : (
                  formatCurrency(product.saleRate)
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {editingId === product.id ? (
                  <Input
                    type="number"
                    className="ml-auto w-20 h-7 text-xs px-1.5 text-right"
                    value={mrp}
                    onChange={(e) => setMrp(e.target.value)}
                    placeholder="MRP"
                  />
                ) : product.mrp != null ? (
                  formatCurrency(product.mrp)
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {editingId === product.id ? (
                  <Input
                    type="number"
                    className="ml-auto w-14 h-7 text-xs px-1.5 text-right"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    min="0"
                    max="100"
                    step="0.01"
                  />
                ) : (
                  `${toNumber(product.discountPercent)}%`
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {editingId === product.id ? (
                  <Input
                    type="number"
                    className="ml-auto w-14 h-7 text-xs px-1.5 text-right"
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                  />
                ) : toNumber(product.gstRate) === 0 ? (
                  "Exempt"
                ) : (
                  `${toNumber(product.gstRate)}%`
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {editingId === product.id ? (
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={isPending}
                      onClick={() => save(product.id)}
                      title="Save changes"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-slate-500 hover:bg-slate-100"
                      onClick={() => setEditingId(null)}
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      onClick={() => startEdit(product)}
                      title="Edit product"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      disabled={isPending}
                      onClick={() => handleDelete(product)}
                      title="Delete product"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
