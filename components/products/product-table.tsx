"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { setProductActive } from "@/lib/actions/products";
import { useRouter } from "next/navigation";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Product } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Pencil, Trash2, Layers } from "lucide-react";
import { BatchEditor } from "@/components/products/batch-editor";
import { ProductChangeLog } from "@/components/products/product-change-log";
import { PrintLabelButton } from "@/components/products/print-label-button";
import { isInventoryPinRequired, verifyInventoryAdminPin } from "@/lib/actions/billing";
import {
  ProductEditDialog,
  type ProductCategoryOption,
} from "@/components/products/product-edit-dialog";

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

export function ProductTable({
  products,
  presentDots,
  categories = [],
}: {
  products: Product[];
  /** Tear-off feed from Settings, passed down to the print button. */
  presentDots?: number;
  categories?: ProductCategoryOption[];
}) {
  const router = useRouter();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleSetActive = (product: Product, active: boolean) => {
    startTransition(async () => {
      try {
        const pinRequired = await isInventoryPinRequired();
        const verb = active ? "activate" : "deactivate";
        if (pinRequired) {
          const pin = window.prompt(
            `Enter Supervisor/Admin PIN to ${verb} product "${product.name}":`
          );
          if (pin === null) return;
          const valid = await verifyInventoryAdminPin(pin);
          if (!valid) {
            alert("Incorrect PIN. Access denied.");
            return;
          }
        } else if (active) {
          if (
            !confirm(
              `Activate "${product.name}"? It will show up in billing again.`
            )
          ) {
            return;
          }
        } else if (
          !confirm(
            `Deactivate "${product.name}"? It will be hidden from billing until someone activates it again under Inactive products.`
          )
        ) {
          return;
        }

        const result = await setProductActive(product.id, active);
        if (!result.ok) {
          alert(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update product");
      }
    });
  };

  return (
    <>
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="bg-slate-50/80">
          <TableHead className="py-2.5 px-3">Product</TableHead>
          <TableHead className="py-2.5 px-2">SKU</TableHead>
          <TableHead className="py-2.5 px-2">HSN</TableHead>
          <TableHead className="py-2.5 px-2">Unit</TableHead>
          <TableHead className="py-2.5 px-2">Expiry</TableHead>
          <TableHead className="py-2.5 px-2 text-right">Stock</TableHead>
          <TableHead className="py-2.5 px-2 text-right">Pur. Rate</TableHead>
          <TableHead className="py-2.5 px-2 text-right">Sale Rate</TableHead>
          <TableHead className="py-2.5 px-2 text-right" title="Wholesale Rate">
            W. Rate
          </TableHead>
          <TableHead className="py-2.5 px-2 text-right">MRP</TableHead>
          <TableHead className="py-2.5 px-2 text-right">Disc %</TableHead>
          <TableHead className="py-2.5 px-2 text-right">GST %</TableHead>
          <TableHead className="py-2.5 px-2 text-right min-w-[9rem]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => {
          const expired = isExpired(product.expiryDate);
          const nearExpiry = isNearExpiry(product.expiryDate);
          return (
            <Fragment key={product.id}>
            <TableRow
              className={
                toNumber(product.stockQty) < 10 ? "bg-amber-50/60" : undefined
              }
            >
              <TableCell className="max-w-[200px] font-medium py-2 px-3">
                <span className="truncate block">{product.name}</span>
              </TableCell>
              <TableCell className="text-slate-500 py-2 px-2 whitespace-nowrap">
                {product.sku ?? "-"}
              </TableCell>
              <TableCell className="text-slate-700 font-mono text-xs py-2 px-2 whitespace-nowrap">
                {product.hsnCode || <span className="text-red-500 font-semibold">Missing!</span>}
              </TableCell>
              <TableCell className="py-2 px-2 whitespace-nowrap">
                <span className="text-slate-600">{product.unit || "Pcs"}</span>
              </TableCell>
              <TableCell className="py-2 px-2 whitespace-nowrap">
                {product.expiryDate ? (
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
                {toNumber(product.stockQty)}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap text-slate-600">
                {formatCurrency(product.purchaseRate)}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {formatCurrency(product.saleRate)}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {product.wholesaleRate != null ? (
                  formatCurrency(product.wholesaleRate)
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {product.mrp != null ? (
                  formatCurrency(product.mrp)
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {`${toNumber(product.discountPercent)}%`}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                {toNumber(product.gstRate) === 0 ? (
                  "Exempt"
                ) : (
                  `${toNumber(product.gstRate)}%`
                )}
              </TableCell>
              <TableCell className="text-right py-2 px-2 whitespace-nowrap">
                <div className="flex justify-end gap-1">
                  <PrintLabelButton
                    product={product}
                    presentDots={presentDots}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`h-7 w-7 hover:bg-slate-100 ${
                      expandedId === product.id
                        ? "text-emerald-700"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    onClick={() =>
                      setExpandedId(
                        expandedId === product.id ? null : product.id
                      )
                    }
                    title="Edit batches"
                  >
                    <Layers className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    onClick={() => setEditingProduct(product)}
                    title="Edit product"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {product.isActive ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      disabled={isPending}
                      onClick={() => handleSetActive(product, false)}
                      title="Deactivate product"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-7 bg-emerald-600 px-2 text-white hover:bg-emerald-700"
                      disabled={isPending}
                      onClick={() => handleSetActive(product, true)}
                    >
                      Activate
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
            {expandedId === product.id && (
              <TableRow key={`batches-${product.id}`} className="bg-slate-50/70">
                <TableCell colSpan={13} className="p-0">
                  <BatchEditor productId={product.id} />
                  <ProductChangeLog productId={product.id} />
                </TableCell>
              </TableRow>
            )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
    <ProductEditDialog
      product={editingProduct}
      categories={categories}
      open={editingProduct != null}
      onClose={() => setEditingProduct(null)}
      onSaved={() => {
        setEditingProduct(null);
        setToast("Product saved");
        router.refresh();
      }}
    />
    {toast ? (
      <div className="fixed bottom-4 right-4 z-[70] rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white shadow-lg">
        {toast}
      </div>
    ) : null}
    </>
  );
}
