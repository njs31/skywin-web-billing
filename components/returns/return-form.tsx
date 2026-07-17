"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, Trash2, X } from "lucide-react";
import { searchProductBatches } from "@/lib/actions/products";
import { createSaleReturn } from "@/lib/actions/billing";
import { calculateLineAmount } from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import type { Customer, Product } from "@/db/schema";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductBatchSearchResults } from "@/components/products/product-batch-search-results";
import { useRouter } from "next/navigation";

type LineItem = { product: Product; qty: number; rate: number };

function isValidGstin(gstin: string) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    gstin.trim().toUpperCase()
  );
}

export function ReturnForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [customerId, setCustomerId] = useState("none");
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerGstin, setCustomerGstin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

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

  const clearCustomer = () => {
    setCustomerId("none");
    setCustomerSearch("");
    setIsCustomerDropdownOpen(false);
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
    if (selectedCustomer) {
      setCustomerGstin(selectedCustomer.gstin?.trim().toUpperCase() ?? "");
    } else {
      setCustomerGstin("");
    }
    setError("");
  }, [selectedCustomer]);

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

  const total = items.reduce(
    (s, i) => s + calculateLineAmount(i.qty, i.rate),
    0
  );

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

    startTransition(async () => {
      try {
        await createSaleReturn({
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
          })),
        });
        setItems([]);
        setReason("");
        setCustomerId("none");
        setCustomerSearch("");
        setCustomerGstin("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save return.");
      }
    });
  };

  return (
    <div className="space-y-4">
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

      {items.map((item) => (
        <div
          key={item.product.id}
          className="flex items-center gap-3 rounded-lg border p-3"
        >
          <span className="flex-1 text-sm font-medium">{item.product.name}</span>
          <Input
            type="number"
            className="w-20"
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
            className="w-24"
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
          <span className="w-24 text-right text-sm font-semibold">
            {formatCurrency(calculateLineAmount(item.qty, item.rate))}
          </span>
          <Button
            size="icon"
            variant="ghost"
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

      {error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-600">
          {error}
        </div>
      ) : null}

      {items.length > 0 && (
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-bold">Return Total: {formatCurrency(total)}</span>
          <Button disabled={isPending} onClick={submit}>
            {isPending ? "Saving..." : "Save Return"}
          </Button>
        </div>
      )}
    </div>
  );
}
