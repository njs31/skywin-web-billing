"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateProduct } from "@/lib/actions/products";
import { isInventoryPinRequired, verifyInventoryAdminPin } from "@/lib/actions/billing";
import { toNumber } from "@/lib/utils";
import type { Product } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UNIT_OPTIONS } from "@/lib/units";
import { X } from "lucide-react";

const GST_OPTIONS = ["0", "5", "12", "18", "28"];

export type ProductCategoryOption = { id: number; name: string };

function rateString(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  return String(toNumber(value));
}

export function ProductEditDialog({
  product,
  categories,
  open,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: ProductCategoryOption[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [purchaseRate, setPurchaseRate] = useState("");
  const [saleRate, setSaleRate] = useState("");
  const [wholesaleRate, setWholesaleRate] = useState("");
  const [mrp, setMrp] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [unit, setUnit] = useState("Pcs");
  const [stockQty, setStockQty] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !product) return;
    setName(product.name);
    setBarcode(product.barcode ?? "");
    setHsnCode(product.hsnCode ?? "");
    setCategoryId(product.categoryId != null ? String(product.categoryId) : "");
    setPurchaseRate(rateString(product.purchaseRate));
    setSaleRate(rateString(product.saleRate));
    setWholesaleRate(rateString(product.wholesaleRate));
    setMrp(rateString(product.mrp));
    setDiscountPercent(rateString(product.discountPercent) || "0");
    setGstRate(rateString(product.gstRate) || "0");
    setUnit(product.unit || "Pcs");
    setStockQty(rateString(product.stockQty) || "0");
    setReorderLevel(
      product.reorderLevel != null ? rateString(product.reorderLevel) : "10"
    );
    setExpiryDate(product.expiryDate ?? "");
    setIsActive(product.isActive);
    setError("");
  }, [open, product]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, isPending, onClose]);

  if (!open || !product) return null;

  const gstOptions = GST_OPTIONS.includes(gstRate)
    ? GST_OPTIONS
    : [...GST_OPTIONS, gstRate];
  const unitOptions = UNIT_OPTIONS.includes(unit as (typeof UNIT_OPTIONS)[number])
    ? UNIT_OPTIONS
    : [unit, ...UNIT_OPTIONS];
  const categoryIds = new Set(categories.map((c) => c.id));
  const missingCategory =
    product.categoryId != null && !categoryIds.has(product.categoryId)
      ? { id: product.categoryId, name: `Category #${product.categoryId}` }
      : null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!hsnCode.trim()) {
      setError("HSN code is mandatory.");
      return;
    }
    const parsedStock = parseFloat(stockQty);
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      setError("Stock must be a number greater than or equal to 0.");
      return;
    }
    const parsedPurchase = parseFloat(purchaseRate);
    if (!Number.isFinite(parsedPurchase) || parsedPurchase < 0) {
      setError("Purchase rate must be a number greater than or equal to 0.");
      return;
    }
    const parsedSale = parseFloat(saleRate);
    if (!Number.isFinite(parsedSale) || parsedSale < 0) {
      setError("Sale rate must be a number greater than or equal to 0.");
      return;
    }
    const parsedReorder = parseFloat(reorderLevel);
    if (!Number.isFinite(parsedReorder) || parsedReorder < 0) {
      setError("Reorder level must be a number greater than or equal to 0.");
      return;
    }
    const parsedWholesale =
      wholesaleRate.trim() === "" ? null : parseFloat(wholesaleRate);
    if (parsedWholesale != null && (!Number.isFinite(parsedWholesale) || parsedWholesale < 0)) {
      setError("Wholesale rate must be a number greater than or equal to 0.");
      return;
    }
    const parsedMrp = mrp.trim() === "" ? null : parseFloat(mrp);
    if (parsedMrp != null && (!Number.isFinite(parsedMrp) || parsedMrp < 0)) {
      setError("MRP must be a number greater than or equal to 0.");
      return;
    }
    const parsedDisc = parseFloat(discountPercent);
    if (!Number.isFinite(parsedDisc) || parsedDisc < 0 || parsedDisc > 100) {
      setError("Discount must be a number between 0 and 100.");
      return;
    }
    const parsedGst = parseFloat(gstRate);
    if (!Number.isFinite(parsedGst) || parsedGst < 0) {
      setError("GST rate must be a number greater than or equal to 0.");
      return;
    }
    const parsedCategory =
      categoryId.trim() === "" ? null : parseInt(categoryId, 10);
    if (parsedCategory != null && !Number.isFinite(parsedCategory)) {
      setError("Please pick a valid category.");
      return;
    }

    startTransition(async () => {
      try {
        const pinRequired = await isInventoryPinRequired();
        if (pinRequired) {
          const pin = window.prompt(
            "Enter Supervisor/Admin PIN to edit product settings:"
          );
          if (pin === null) return;
          const valid = await verifyInventoryAdminPin(pin);
          if (!valid) {
            setError("Incorrect PIN. Access denied.");
            return;
          }
        }
        await updateProduct(product.id, {
          name: name.trim(),
          barcode: barcode.trim() === "" ? null : barcode.trim(),
          saleRate: parsedSale,
          purchaseRate: parsedPurchase,
          wholesaleRate:
            parsedWholesale != null && Number.isFinite(parsedWholesale)
              ? parsedWholesale
              : null,
          mrp: parsedMrp != null && Number.isFinite(parsedMrp) ? parsedMrp : null,
          discountPercent: parsedDisc,
          gstRate: parsedGst,
          hsnCode: hsnCode.trim(),
          expiryDate: expiryDate.trim() || null,
          stockQty: parsedStock,
          reorderLevel: parsedReorder,
          unit,
          categoryId: parsedCategory,
          isActive,
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update product");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-product-title"
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 id="edit-product-title" className="text-lg font-semibold">
              Edit Product
            </h3>
            <p className="truncate text-sm text-slate-500">{product.name}</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-name">Product Name *</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-sku">SKU</Label>
                <Input
                  id="edit-sku"
                  value={product.sku ?? ""}
                  readOnly
                  disabled
                  className="bg-slate-50 text-slate-600"
                />
                <p className="text-xs text-slate-500">Auto-generated and cannot be changed here.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-barcode">Barcode / Scan Code</Label>
                <Input
                  id="edit-barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or enter code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-hsn">HSN Code *</Label>
                <Input
                  id="edit-hsn"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  placeholder="Mandatory GST HSN Code"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <select
                  id="edit-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">None</option>
                  {missingCategory ? (
                    <option value={String(missingCategory.id)}>
                      {missingCategory.name}
                    </option>
                  ) : null}
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-purchase">Purchase Rate (₹) *</Label>
                <Input
                  id="edit-purchase"
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseRate}
                  onChange={(e) => setPurchaseRate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-sale">Sale Rate (₹) *</Label>
                <Input
                  id="edit-sale"
                  type="number"
                  step="0.01"
                  min="0"
                  value={saleRate}
                  onChange={(e) => setSaleRate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-wholesale">Wholesale Rate (₹)</Label>
                <Input
                  id="edit-wholesale"
                  type="number"
                  step="0.01"
                  min="0"
                  value={wholesaleRate}
                  onChange={(e) => setWholesaleRate(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-mrp">MRP (₹)</Label>
                <Input
                  id="edit-mrp"
                  type="number"
                  step="0.01"
                  min="0"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-discount">Discount (%)</Label>
                <Input
                  id="edit-discount"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-gst">GST Rate (%)</Label>
                <select
                  id="edit-gst"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {gstOptions.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate === "0" ? "0% (Exempt)" : `${rate}%`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-unit">Unit of Measurement</Label>
                <select
                  id="edit-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-stock">Stock Quantity</Label>
                <Input
                  id="edit-stock"
                  type="number"
                  step="0.01"
                  min="0"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-reorder">Reorder Level</Label>
                <Input
                  id="edit-reorder"
                  type="number"
                  step="0.01"
                  min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-expiry">Expiry Date</Label>
                <Input
                  id="edit-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <select
                  id="edit-status"
                  value={isActive ? "active" : "inactive"}
                  onChange={(e) => setIsActive(e.target.value === "active")}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-600">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
