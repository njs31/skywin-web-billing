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

export function ProductTable({ products }: { products: Product[] }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saleRate, setSaleRate] = useState("");
  const [gstRate, setGstRate] = useState("");
  const [isPending, startTransition] = useTransition();

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setSaleRate(String(toNumber(product.saleRate)));
    setGstRate(String(toNumber(product.gstRate)));
  };

  const save = (id: number) => {
    startTransition(async () => {
      await updateProduct(id, {
        saleRate: parseFloat(saleRate),
        gstRate: parseFloat(gstRate),
      });
      setEditingId(null);
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>SKU</TableHead>
          <TableHead className="text-right">Stock</TableHead>
          <TableHead className="text-right">Purchase Rate</TableHead>
          <TableHead className="text-right">Sale Rate</TableHead>
          <TableHead className="text-right">GST %</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
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
                  className="ml-auto w-16"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                />
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
        ))}
      </TableBody>
    </Table>
  );
}
