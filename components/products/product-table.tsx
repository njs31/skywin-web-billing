"use client";

import { useState, useTransition } from "react";
import { updateProduct } from "@/lib/actions/products";
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saleRate, setSaleRate] = useState("");
  const [mrp, setMrp] = useState("");
  const [gstRate, setGstRate] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [isPending, startTransition] = useTransition();

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setSaleRate(String(toNumber(product.saleRate)));
    setMrp(product.mrp != null ? String(toNumber(product.mrp)) : "");
    setGstRate(String(toNumber(product.gstRate)));
    setHsnCode(product.hsnCode ?? "");
    setExpiryDate(product.expiryDate ?? "");
  };

  const save = (id: number) => {
    if (!hsnCode.trim()) {
      alert("HSN code is mandatory.");
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
        await updateProduct(id, {
          saleRate: Number.isFinite(parsedSale) ? parsedSale : 0,
          mrp: parsedMrp != null && Number.isFinite(parsedMrp) ? parsedMrp : null,
          gstRate: Number.isFinite(parseFloat(gstRate)) ? parseFloat(gstRate) : 0,
          hsnCode: hsnCode.trim(),
          expiryDate: expiryDate.trim() || null,
        });
        setEditingId(null);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update product");
      }
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead>HSN Code</TableHead>
          <TableHead>Expiry Date</TableHead>
          <TableHead className="text-right">Stock</TableHead>
          <TableHead className="text-right">Purchase Rate</TableHead>
          <TableHead className="text-right">Sale Rate</TableHead>
          <TableHead className="text-right">MRP</TableHead>
          <TableHead className="text-right">GST %</TableHead>
          <TableHead></TableHead>
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
                toNumber(product.stockQty) < 10 ? "bg-amber-50" : undefined
              }
            >
              <TableCell className="max-w-xs font-medium">
                {product.name}
              </TableCell>
              <TableCell className="text-slate-500">
                {product.sku ?? "-"}
              </TableCell>
              <TableCell className="text-slate-700 font-mono text-sm">
                {editingId === product.id ? (
                  <Input
                    className="w-24 h-8"
                    value={hsnCode}
                    onChange={(e) => setHsnCode(e.target.value)}
                    placeholder="HSN..."
                  />
                ) : (
                  product.hsnCode || <span className="text-red-500 font-bold">Missing!</span>
                )}
              </TableCell>
              <TableCell>
                {editingId === product.id ? (
                  <Input
                    type="date"
                    className="h-8 w-36"
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
                    {expired ? " (Expired)" : nearExpiry ? " (Near)" : ""}
                  </span>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {toNumber(product.stockQty)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(product.purchaseRate)}
              </TableCell>
              <TableCell className="text-right">
                {editingId === product.id ? (
                  <Input
                    type="number"
                    className="ml-auto w-24"
                    value={saleRate}
                    onChange={(e) => setSaleRate(e.target.value)}
                  />
                ) : (
                  formatCurrency(product.saleRate)
                )}
              </TableCell>
              <TableCell className="text-right">
                {editingId === product.id ? (
                  <Input
                    type="number"
                    className="ml-auto w-24"
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
              <TableCell className="text-right">
                {editingId === product.id ? (
                  <Input
                    type="number"
                    className="ml-auto w-16"
                    value={gstRate}
                    onChange={(e) => setGstRate(e.target.value)}
                  />
                ) : toNumber(product.gstRate) === 0 ? (
                  "Exempt"
                ) : (
                  `${toNumber(product.gstRate)}%`
                )}
              </TableCell>
              <TableCell className="text-right">
                {editingId === product.id ? (
                  <Button size="sm" disabled={isPending} onClick={() => save(product.id)}>
                    Save
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(product)}
                  >
                    Edit
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
