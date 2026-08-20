"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, Trash2, X } from "lucide-react";
import { searchProductBatches } from "@/lib/actions/products";
import { createSaleReturn, updateSaleReturn } from "@/lib/actions/billing";
import { searchSalesForReturn } from "@/lib/actions/sales";
import { calculateLineAmount } from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Customer, Product } from "@/db/schema";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
import type { SaleInvoiceOption } from "@/lib/queries/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductBatchSearchResults } from "@/components/products/product-batch-search-results";
import { useRouter } from "next/navigation";

type LineItem = {
  product: Product;
  qty: number;
  rate: number;
  discountPercent: number;
};

export type SaleReturnEditInitial = {
  id: number;
  returnNo: string;
  saleId: number | null;
  saleInvoiceNo: string | null;
  customerId: number | null;
  customerGstin: string | null;
  reason: string | null;
  items: Array<{
    productId: number | null;
    productName: string | null;
    customName?: string | null;
    hsnCode: string | null;
    qty: string;
    rate: string;
    discountPercent?: string | null;
    discountValue?: string | null;
    discountType?: string | null;
    gstRate: string;
    saleRate?: string | null;
    wholesaleRate?: string | null;
    purchaseRate?: string | null;
    sku?: string | null;
    barcode?: string | null;
    stockQty?: string | null;
    productGstRate?: string | null;
  }>;
};

function isValidGstin(gstin: string) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    gstin.trim().toUpperCase()
  );
}

function discOf(item: LineItem) {
  return calculateLineAmount(item.qty, item.rate, item.discountPercent, "percent");
}

export function ReturnForm({
  customers,
  initialReturn,
}: {
  customers: Customer[];
  initialReturn?: SaleReturnEditInitial;
}) {
  const router = useRouter();
  const isEdit = Boolean(initialReturn);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [items, setItems] = useState<LineItem[]>(() => {
    if (!initialReturn) return [];
    return initialReturn.items
      .filter((i) => i.productId != null)
      .map((i) => {
        const disc =
          i.discountType === "value"
            ? toNumber(i.discountPercent ?? 0)
            : toNumber(i.discountPercent ?? i.discountValue ?? 0);
        return {
          product: {
            id: i.productId as number,
            name: i.productName || i.customName || "Item",
            sku: i.sku ?? null,
            barcode: i.barcode ?? null,
            hsnCode: i.hsnCode,
            gstRate: i.productGstRate ?? i.gstRate,
            saleRate: i.saleRate ?? i.rate,
            wholesaleRate: i.wholesaleRate ?? null,
            purchaseRate: i.purchaseRate ?? "0",
            stockQty: i.stockQty ?? "0",
          } as Product,
          qty: toNumber(i.qty),
          rate: toNumber(i.rate),
          discountPercent: disc,
        };
      });
  });
  const [customerId, setCustomerId] = useState(
    initialReturn?.customerId ? String(initialReturn.customerId) : "none"
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerGstin, setCustomerGstin] = useState(
    initialReturn?.customerGstin?.trim().toUpperCase() ?? ""
  );
  const [reason, setReason] = useState(initialReturn?.reason ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [invoiceQuery, setInvoiceQuery] = useState(
    initialReturn?.saleInvoiceNo ?? ""
  );
  const [invoiceResults, setInvoiceResults] = useState<SaleInvoiceOption[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<SaleInvoiceOption | null>(
    initialReturn?.saleId && initialReturn.saleInvoiceNo
      ? {
          id: initialReturn.saleId,
          invoiceNo: initialReturn.saleInvoiceNo,
          customerId: initialReturn.customerId,
          customerName:
            customers.find((c) => c.id === initialReturn.customerId)?.name ??
            "Customer",
          billType: "retail",
          date: new Date(),
          grandTotal: "0",
        }
      : null
  );
  const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false);

  const selectedCustomer = useMemo(
    () =>
      customerId === "none"
        ? null
        : customers.find((c) => String(c.id) === customerId) ?? null,
    [customerId, customers]
  );

  const isWholesale = selectedCustomer?.type === "wholesale";

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          (c.gstin && c.gstin.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [customers, customerSearch]);

  useEffect(() => {
    if (!initialReturn?.customerId) return;
    const c = customers.find((x) => x.id === initialReturn.customerId);
    if (c) setCustomerSearch(c.name);
  }, [initialReturn, customers]);

  const clearCustomer = () => {
    setCustomerId("none");
    setCustomerSearch("");
    setIsCustomerDropdownOpen(false);
  };

  const clearInvoice = () => {
    setSelectedInvoice(null);
    setInvoiceQuery("");
    setInvoiceResults([]);
    setIsInvoiceDropdownOpen(false);
  };

  const pickInvoice = (inv: SaleInvoiceOption) => {
    setSelectedInvoice(inv);
    setInvoiceQuery(inv.invoiceNo);
    setIsInvoiceDropdownOpen(false);
    if (inv.customerId) {
      setCustomerId(String(inv.customerId));
      setCustomerSearch(inv.customerName);
      setIsCustomerDropdownOpen(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim())
        setResults(await searchProductBatches(query, 15, { onlyInStock: false }));
      else setResults([]);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (selectedInvoice) return;
    const t = setTimeout(async () => {
      const rows = await searchSalesForReturn(invoiceQuery, {
        customerId:
          customerId !== "none" ? parseInt(customerId, 10) : undefined,
        limit: 15,
      });
      setInvoiceResults(rows);
    }, 250);
    return () => clearTimeout(t);
  }, [invoiceQuery, customerId, selectedInvoice]);

  useEffect(() => {
    if (isEdit) return;
    if (selectedCustomer) {
      setCustomerGstin(selectedCustomer.gstin?.trim().toUpperCase() ?? "");
    } else {
      setCustomerGstin("");
    }
    setError("");
  }, [selectedCustomer, isEdit]);

  const addItem = (p: Product) => {
    if (!p.hsnCode || !p.hsnCode.trim()) {
      alert(
        `HSN code is mandatory. Product "${p.name}" lacks an HSN code. Please update the product in Inventory first.`
      );
      return;
    }
    if (items.some((i) => i.product.id === p.id)) return;
    setItems((prev) => [
      ...prev,
      {
        product: p,
        qty: 1,
        rate: toNumber(isWholesale ? p.wholesaleRate ?? p.saleRate : p.saleRate),
        discountPercent: 0,
      },
    ]);
    setQuery("");
    setResults([]);
  };

  const addBatchRow = (row: ProductBatchSearchResult) => {
    addItem({
      id: row.productId,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      hsnCode: row.hsnCode,
      gstRate: row.gstRate,
      saleRate: row.saleRate,
      wholesaleRate: row.wholesaleRate,
      purchaseRate: row.purchaseRate,
      stockQty: row.productStockQty,
    } as Product);
  };

  const total = items.reduce((s, i) => s + discOf(i), 0);

  const submit = () => {
    if (items.length === 0) return;
    setError("");

    if (isWholesale) {
      const gstin = customerGstin.trim().toUpperCase();
      if (!gstin) {
        setError("GSTIN is required for wholesale customer returns.");
        return;
      }
      if (!isValidGstin(gstin)) {
        setError(
          "Enter a valid 15-character GSTIN (e.g. 33AAAAA0000A1Z5)."
        );
        return;
      }
    }

    const payload = {
      saleId: selectedInvoice?.id,
      customerId:
        customerId !== "none" ? parseInt(customerId, 10) : undefined,
      customerGstin: customerGstin.trim()
        ? customerGstin.trim().toUpperCase()
        : undefined,
      reason: reason || undefined,
      items: items.map((i) => ({
        productId: i.product.id,
        qty: i.qty,
        rate: i.rate,
        gstRate: toNumber(i.product.gstRate),
        discountPercent: i.discountPercent,
        discountType: "percent" as const,
        discountValue: i.discountPercent,
      })),
    };

    startTransition(async () => {
      try {
        if (isEdit && initialReturn) {
          await updateSaleReturn(initialReturn.id, payload);
          router.push(`/returns/${initialReturn.id}`);
          router.refresh();
          return;
        }
        await createSaleReturn(payload);
        setItems([]);
        setReason("");
        setCustomerId("none");
        setCustomerSearch("");
        setCustomerGstin("");
        clearInvoice();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save return.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {isEdit ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Editing credit note <strong>{initialReturn?.returnNo}</strong>. Saving
          updates lines, totals, and stock.
        </p>
      ) : null}

      <div>
        <Label>Against Invoice (original bill)</Label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9 pr-9"
            placeholder="Search invoice no. or customer..."
            value={
              selectedInvoice && !isInvoiceDropdownOpen
                ? `${selectedInvoice.invoiceNo} — ${selectedInvoice.customerName}`
                : invoiceQuery
            }
            onChange={(e) => {
              setInvoiceQuery(e.target.value);
              setSelectedInvoice(null);
              setIsInvoiceDropdownOpen(true);
            }}
            onFocus={() => {
              setIsInvoiceDropdownOpen(true);
              if (selectedInvoice) {
                setInvoiceQuery(selectedInvoice.invoiceNo);
              }
            }}
          />
          {(selectedInvoice || invoiceQuery) && (
            <button
              type="button"
              className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={clearInvoice}
              title="Clear invoice"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isInvoiceDropdownOpen && (
            <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
              {invoiceResults.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-400">
                  No invoices found
                </p>
              ) : (
                invoiceResults.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => pickInvoice(inv)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-emerald-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">
                        {inv.invoiceNo}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {inv.customerName} · {inv.billType} ·{" "}
                        {new Date(inv.date).toLocaleDateString("en-IN")}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-slate-700">
                      {formatCurrency(inv.grandTotal)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Select the original bill so the credit note print shows “Against Invoice No”
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Customer</Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9 pr-9"
              placeholder="Search by name, phone, or GSTIN..."
              value={
                selectedCustomer && !isCustomerDropdownOpen
                  ? `${selectedCustomer.name}${
                      selectedCustomer.type === "wholesale"
                        ? " (Wholesale)"
                        : ""
                    }`
                  : customerSearch
              }
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setCustomerId("none");
                setIsCustomerDropdownOpen(true);
              }}
              onFocus={() => {
                setIsCustomerDropdownOpen(true);
                if (selectedCustomer) {
                  setCustomerSearch(selectedCustomer.name);
                }
              }}
            />
            {(selectedCustomer || customerSearch) && (
              <button
                type="button"
                className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={clearCustomer}
                title="Clear customer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {isCustomerDropdownOpen && (
              <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    clearCustomer();
                  }}
                  className="flex w-full items-center rounded px-2 py-2 text-left text-sm font-medium text-slate-700 hover:bg-emerald-50"
                >
                  Walk-in customer
                </button>
                {filteredCustomers.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-slate-400">
                    No customers match your search
                  </p>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCustomerId(String(c.id));
                        setCustomerSearch(c.name);
                        setIsCustomerDropdownOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-emerald-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">
                          {c.name}
                          {c.type === "wholesale" ? (
                            <span className="ml-1 text-[10px] font-semibold uppercase text-emerald-700">
                              Wholesale
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {[c.phone, c.gstin].filter(Boolean).join(" · ") ||
                            "No phone / GSTIN"}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Type to search, or leave as Walk-in
          </p>
        </div>
        <div>
          <Label>Reason</Label>
          <Input
            className="mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Defective, wrong item, etc."
          />
        </div>
      </div>

      {selectedCustomer ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>
                Customer GSTIN
                {isWholesale ? " *" : " (optional)"}
              </Label>
              <Input
                value={customerGstin}
                onChange={(e) =>
                  setCustomerGstin(e.target.value.toUpperCase())
                }
                placeholder="33AAAAA0000A1Z5"
                maxLength={15}
                className="mt-1 font-mono uppercase"
              />
              <p className="mt-1 text-xs text-slate-500">
                {isWholesale
                  ? "Wholesale returns require GSTIN for the credit note."
                  : "Optional — saved on the credit note if provided."}
              </p>
            </div>
            <div className="text-sm text-slate-600 sm:pt-7">
              <p>
                Type:{" "}
                <span className="font-medium capitalize">
                  {selectedCustomer.type}
                </span>
              </p>
              {selectedCustomer.phone ? (
                <p>Phone: {selectedCustomer.phone}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <Input
        placeholder="Search product to return..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ProductBatchSearchResults
          results={results}
          rateMode={isWholesale ? "wholesale" : "sale"}
          onSelect={addBatchRow}
        />
      )}

      {items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <div className="grid grid-cols-[1fr_4.5rem_5rem_4.5rem_5.5rem_2rem] gap-2 border-b bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Disc %</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {items.map((item) => (
            <div
              key={item.product.id}
              className="grid grid-cols-[1fr_4.5rem_5rem_4.5rem_5.5rem_2rem] items-center gap-2 border-b px-3 py-2 last:border-b-0"
            >
              <span className="truncate text-sm font-medium">
                {item.product.name}
              </span>
              <Input
                type="number"
                className="h-8 text-right"
                value={item.qty}
                min={0.01}
                step={0.01}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.product.id === item.product.id
                        ? { ...i, qty: parseFloat(e.target.value) || 0 }
                        : i
                    )
                  )
                }
              />
              <Input
                type="number"
                className="h-8 text-right"
                value={item.rate}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.product.id === item.product.id
                        ? { ...i, rate: parseFloat(e.target.value) || 0 }
                        : i
                    )
                  )
                }
              />
              <Input
                type="number"
                className="h-8 text-right"
                value={item.discountPercent}
                min={0}
                max={100}
                step={0.01}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((i) =>
                      i.product.id === item.product.id
                        ? {
                            ...i,
                            discountPercent: parseFloat(e.target.value) || 0,
                          }
                        : i
                    )
                  )
                }
              />
              <span className="text-right text-sm font-semibold">
                {formatCurrency(discOf(item))}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() =>
                  setItems((prev) =>
                    prev.filter((i) => i.product.id !== item.product.id)
                  )
                }
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-600">
          {error}
        </div>
      ) : null}

      {items.length > 0 && (
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-bold">Return Total: {formatCurrency(total)}</span>
          <div className="flex gap-2">
            {isEdit ? (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => router.push(`/returns/${initialReturn!.id}`)}
              >
                Cancel
              </Button>
            ) : null}
            <Button disabled={isPending} onClick={submit}>
              {isPending
                ? "Saving..."
                : isEdit
                  ? "Update Return"
                  : "Save Return"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
