"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Minus,
  Plus,
  Search,
  Trash2,
  ShoppingBag,
  Scan,
  ChevronDown,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { InlineLoader } from "@/components/ui/page-loader";
import { searchProductBatches } from "@/lib/actions/products";
import { createSale } from "@/lib/actions/sales";
import {
  calculateGstBreakdown,
  applyRupeeRounding,
  calculateLineAmount,
  getProductRate,
  getBatchBillingRate,
  isInterstateGst,
} from "@/lib/gst";
import { formatCurrency, toNumber } from "@/lib/utils";
import { checkBelowCost } from "@/lib/pricing";
import type { Customer, Product } from "@/db/schema";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
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
import { ProductBatchSearchResults } from "@/components/products/product-batch-search-results";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { useRouter } from "next/navigation";
import { BUSINESS } from "@/lib/business";

type CartItem = {
  id: string;
  product?: Product | null;
  batchId?: number | null;
  batchNumber?: string | null;
  batchExpiry?: string | null;
  name: string;
  qty: number;
  rate: number;
  gstRate: number;
  discountType: "percent" | "value";
  discountValue: number;
  hsnCode?: string;
  availableQty: number;
  /** Landed cost per unit, for the below-cost warning. 0 when unknown. */
  cost: number;
};

type PosScreenProps = {
  customers: Customer[];
  defaultOperator?: string;
};

export function PosScreen({ customers: initialCustomers, defaultOperator }: PosScreenProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billType, setBillType] = useState<"retail" | "wholesale">("retail");
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [customerId, setCustomerId] = useState<string>("none");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<
    "cash" | "upi" | "credit" | "card" | "cheque"
  >("cash");
  const [splitCashUpi, setSplitCashUpi] = useState(false);
  const [cashAmountInput, setCashAmountInput] = useState("");
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
  const [customHsn, setCustomHsn] = useState("");

  // Customer search & outstanding balance states
  const [customerSearch, setCustomerSearch] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerOutstanding, setCustomerOutstanding] = useState<number | null>(null);
  const [loadingOutstanding, setLoadingOutstanding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [poNumber, setPoNumber] = useState("");
  const [quotationNumber, setQuotationNumber] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [dispatchedThrough, setDispatchedThrough] = useState("");
  const [destination, setDestination] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [eInvoiceRequested, setEInvoiceRequested] = useState(false);

  useEffect(() => {
    setCustomers(initialCustomers);
  }, [initialCustomers]);

  const handleCustomerCreated = (customer: Customer) => {
    setCustomers((prev) => {
      if (prev.some((c) => c.id === customer.id)) return prev;
      return [...prev, customer].sort((a, b) => a.name.localeCompare(b.name));
    });
    setCustomerId(String(customer.id));
    setCustomerSearch(customer.name);
    setCustomerName("");
    setCustomerPhone("");
    setIsCustomerDropdownOpen(false);
    setBillType(customer.type === "wholesale" ? "wholesale" : "retail");
    router.refresh();
  };

  const searchSeq = useRef(0);
  useEffect(() => {
    const seq = ++searchSeq.current;
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchProductBatches(q, 20, {
          onlyInStock: false,
        });
        // Drop out-of-order responses so slow queries can't overwrite
        // results for what the cashier is currently typing.
        if (seq === searchSeq.current) setResults(rows);
      } finally {
        if (seq === searchSeq.current) setIsSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (customerId && customerId !== "none") {
      const cid = parseInt(customerId, 10);
      if (!isNaN(cid)) {
        setLoadingOutstanding(true);
        import("@/lib/actions/billing").then(({ getCustomerOutstanding }) => {
          getCustomerOutstanding(cid)
            .then((res) => {
              setCustomerOutstanding(res);
            })
            .finally(() => setLoadingOutstanding(false));
        });
      }
    } else {
      setCustomerOutstanding(null);
      setLoadingOutstanding(false);
    }
  }, [customerId]);

  const addToCart = useCallback(
    (product: Product, qty = 1, batch?: {
      batchId: number | null;
      batchNumber: string | null;
      batchExpiry: string | null;
      availableQty: number;
    }) => {
      if (!product.hsnCode || !product.hsnCode.trim()) {
        setError(
          `HSN code is mandatory. "${product.name}" has no HSN — update it in Inventory first.`
        );
        return;
      }
      const stock = batch?.availableQty ?? toNumber(product.stockQty);
      if (stock <= 0) {
        setError(`"${product.name}" is out of stock and cannot be sold.`);
        return;
      }

      const cartId = batch?.batchId
        ? `p-${product.id}-b-${batch.batchId}`
        : `p-${product.id}`;

      setCart((prev) => {
        const existing = prev.find((c) => c.id === cartId);
        const nextQty = (existing?.qty ?? 0) + qty;
        if (nextQty > stock) {
          setError(
            `Insufficient stock for "${product.name}"${
              batch?.batchNumber ? ` (batch ${batch.batchNumber})` : ""
            }. Available: ${stock}, in cart: ${existing?.qty ?? 0}`
          );
          return prev;
        }

        setError("");
        if (existing) {
          return prev.map((c) =>
            c.id === cartId ? { ...c, qty: c.qty + qty } : c
          );
        }
        const rate = getProductRate(product, billType);
        return [
          ...prev,
          {
            id: cartId,
            product,
            batchId: batch?.batchId ?? null,
            batchNumber: batch?.batchNumber ?? null,
            batchExpiry: batch?.batchExpiry ?? null,
            name: product.name,
            qty,
            rate,
            gstRate: toNumber(product.gstRate),
            discountType: "percent" as const,
            discountValue: toNumber(product.discountPercent ?? 0),
            availableQty: stock,
            cost: toNumber(product.purchaseRate),
          },
        ];
      });
      setQuery("");
      setResults([]);
      searchRef.current?.focus();
    },
    [billType]
  );

  const addBatchToCart = useCallback(
    (row: ProductBatchSearchResult, qty = 1) => {
      const product = {
        id: row.productId,
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        hsnCode: row.hsnCode,
        gstRate: row.gstRate,
        // Bill at this batch's sale rate (fall back to product rate).
        saleRate: String(getBatchBillingRate(row, "sale")),
        wholesaleRate: row.wholesaleRate,
        purchaseRate: row.batchPurchaseRate ?? row.purchaseRate,
        stockQty: row.batchQty || row.productStockQty,
        discountPercent: row.discountPercent,
      } as Product;

      addToCart(product, qty, {
        batchId: row.batchId,
        batchNumber: row.batchNumber,
        batchExpiry: row.batchExpiry,
        availableQty: toNumber(row.batchQty || row.productStockQty),
      });
    },
    [addToCart]
  );

  const addCustomItem = () => {
    if (!customName.trim() || !customQty || !customRate) return;
    if (!customHsn.trim()) {
      setError("HSN code is a mandatory field for manual entry.");
      return;
    }
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
        hsnCode: customHsn.trim(),
        availableQty: 999999,
        cost: 0,
      },
    ]);

    // Reset fields
    setCustomNameField("");
    setCustomQty("1");
    setCustomRate("");
    setCustomDiscVal("0");
    setCustomHsn("");
    setShowCustomForm(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      addBatchToCart(results[0]);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => {
      const item = prev.find((c) => c.id === id);
      if (!item) return prev;
      const next = item.qty + delta;
      if (next <= 0) return prev.filter((c) => c.id !== id);
      if (item.product && next > item.availableQty) {
        setError(
          `Insufficient stock for "${item.name}"${
            item.batchNumber ? ` (batch ${item.batchNumber})` : ""
          }. Available: ${item.availableQty}`
        );
        return prev;
      }
      setError("");
      return prev.map((c) => (c.id === id ? { ...c, qty: next } : c));
    });
  };

  const setQty = (id: string, raw: string) => {
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const next = Math.round(parsed * 100) / 100;
    setCart((prev) => {
      const item = prev.find((c) => c.id === id);
      if (!item) return prev;
      if (item.product && next > item.availableQty) {
        setError(
          `Insufficient stock for "${item.name}"${
            item.batchNumber ? ` (batch ${item.batchNumber})` : ""
          }. Available: ${item.availableQty}`
        );
        return prev;
      }
      setError("");
      return prev.map((c) => (c.id === id ? { ...c, qty: next } : c));
    });
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

  const selectedCustomer = useMemo(
    () =>
      customerId && customerId !== "none"
        ? customers.find((c) => String(c.id) === customerId) ?? null
        : null,
    [customers, customerId]
  );

  const interstate = isInterstateGst(
    selectedCustomer?.gstin,
    BUSINESS.stateCode
  );

  const gst = applyRupeeRounding(
    calculateGstBreakdown(
      cart.map((c) => ({
        qty: c.qty,
        rate: c.rate,
        gstRate: c.gstRate,
        discountType: c.discountType,
        discountValue: c.discountValue,
      })),
      { billDiscount: parseFloat(billDiscount) || 0, interstate }
    )
  );

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

  const belowCostCount = useMemo(
    () => cart.filter((c) => checkBelowCost(c).belowCost).length,
    [cart]
  );

  const billCreditAmount = paymentMode === "credit" ? gst.grandTotal : 0;
  const projectedDebt =
    customerOutstanding !== null
      ? customerOutstanding + billCreditAmount
      : null;

  const canSplitPayment =
    billType === "retail" &&
    (paymentMode === "cash" || paymentMode === "upi");

  const needsEway = gst.grandTotal > 50000;

  const splitCashAmount = Math.min(
    gst.grandTotal,
    Math.max(0, parseFloat(cashAmountInput) || 0)
  );
  const splitUpiAmount = Math.max(
    0,
    Math.round((gst.grandTotal - splitCashAmount) * 100) / 100
  );

  const completeSale = () => {
    if (cart.length === 0) return;
    if (paymentMode === "credit" && (!customerId || customerId === "none")) {
      setError("Customer registration required for credit transactions.");
      return;
    }

    let cashAmount = 0;
    let upiAmount = 0;
    let mode = paymentMode;

    if (canSplitPayment && splitCashUpi) {
      cashAmount = splitCashAmount;
      upiAmount = splitUpiAmount;
      if (Math.abs(cashAmount + upiAmount - gst.grandTotal) > 0.01) {
        setError("Cash + UPI must equal the bill total.");
        return;
      }
      if (cashAmount <= 0 || upiAmount <= 0) {
        setError("Enter a cash amount between 0 and the bill total for split payment.");
        return;
      }
      mode = cashAmount >= upiAmount ? "cash" : "upi";
    } else if (paymentMode === "cash") {
      cashAmount = gst.grandTotal;
      upiAmount = 0;
    } else if (paymentMode === "upi") {
      cashAmount = 0;
      upiAmount = gst.grandTotal;
    } else {
      // card / cheque — fully paid at counter
      cashAmount = 0;
      upiAmount = 0;
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
          paymentMode: mode,
          cashAmount,
          upiAmount,
          paidAmount:
            mode === "credit" ? 0 : gst.grandTotal,
          operatorName,
          discountAmount: parseFloat(billDiscount) || 0,
          poNumber: poNumber.trim() || undefined,
          quotationNumber: quotationNumber.trim() || undefined,
          ewayBillNo: needsEway ? ewayBillNo.trim() || undefined : undefined,
          vehicleNo:
            needsEway || billType === "retail"
              ? vehicleNo.trim() || undefined
              : undefined,
          dispatchedThrough:
            needsEway || billType === "retail"
              ? dispatchedThrough.trim() || undefined
              : undefined,
          destination: needsEway ? destination.trim() || undefined : undefined,
          deliveryNote: deliveryNote.trim() || undefined,
          paymentTerms: paymentTerms.trim() || undefined,
          transporterName:
            billType === "retail"
              ? transporterName.trim() || undefined
              : undefined,
          eInvoiceRequested,
          items: cart.map((c) => ({
            productId: c.product ? c.product.id : undefined,
            customName: c.product ? undefined : c.name,
            qty: c.qty,
            rate: c.rate,
            gstRate: c.gstRate,
            discountType: c.discountType,
            discountValue: c.discountValue,
            hsnCode: c.product ? (c.product.hsnCode || null) : c.hsnCode,
            batchId: c.batchId ?? undefined,
          })),
        });
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setBillDiscount("");
        setCashAmountInput("");
        setSplitCashUpi(false);
        setTransporterName("");
        setVehicleNo("");
        setDispatchedThrough("");
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
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={eInvoiceRequested}
                onChange={(e) => setEInvoiceRequested(e.target.checked)}
              />
              e-Invoice
            </label>
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
        </div>

        <ProductScanBar
          onProductScanned={(product, qty) => addToCart(product, qty)}
          placeholder="Scan QR / barcode — adds to cart instantly"
        />

        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            ref={searchRef}
            className="pl-10 pr-10 text-base"
            placeholder="Search product, SKU, or scan barcode..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-emerald-600" />
          )}
          {isSearching && query.trim().length >= 1 && results.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 shadow-md">
              <InlineLoader label="Searching products…" />
            </div>
          )}
          {!isSearching && query.trim().length >= 1 && results.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-md">
              No products found
            </div>
          )}
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full">
              <ProductBatchSearchResults
                results={results}
                rateMode={billType === "wholesale" ? "wholesale" : "sale"}
                onSelect={(row) => addBatchToCart(row)}
              />
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
              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Product Name *</Label>
                  <Input
                    className="h-9 bg-white"
                    placeholder="Enter product name..."
                    value={customName}
                    onChange={(e) => setCustomNameField(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">HSN Code *</Label>
                  <Input
                    className="h-9 bg-white"
                    placeholder="Mandatory HSN..."
                    value={customHsn}
                    onChange={(e) => setCustomHsn(e.target.value)}
                  />
                </div>
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
                          <span className="ml-1.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">
                            Manual
                          </span>
                        )}
                      </p>
                      {item.batchNumber ? (
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Batch {item.batchNumber}
                          {item.batchExpiry ? ` · Exp ${item.batchExpiry}` : ""}
                        </p>
                      ) : null}
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
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        value={item.qty}
                        onChange={(e) => setQty(item.id, e.target.value)}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v) || v <= 0) {
                            setQty(item.id, "1");
                          }
                        }}
                        className="h-7 w-16 rounded border border-slate-200 bg-white px-1 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        aria-label={`Quantity for ${item.name}`}
                      />
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
                    {(() => {
                      const b = checkBelowCost(item);
                      return b.belowCost ? (
                        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Below cost: {formatCurrency(b.effectiveRate)} /unit vs
                          cost {formatCurrency(b.cost)}
                        </p>
                      ) : null;
                    })()}
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
              {interstate ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">IGST</span>
                  <span>{formatCurrency(gst.igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">CGST</span>
                    <span>{formatCurrency(gst.cgst)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">SGST</span>
                    <span>{formatCurrency(gst.sgst)}</span>
                  </div>
                </>
              )}
              {gst.roundOff != null && Math.abs(gst.roundOff) >= 0.005 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Round Off</span>
                  <span>
                    {gst.roundOff > 0 ? "+" : ""}
                    {formatCurrency(gst.roundOff)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-emerald-700">
                  {formatCurrency(gst.grandTotal)}
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-slate-600 font-medium">
                  Customer
                </Label>
                <AddCustomerDialog
                  compactTrigger
                  defaultName={customerSearch.trim() || customerName}
                  defaultPhone={customerPhone}
                  onCreated={handleCustomerCreated}
                />
              </div>
              <div className="relative mt-1">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    className="h-9 pl-9 text-sm"
                    placeholder="Search customer by name, phone, or GSTIN..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                  />
                </div>
                <div className="relative mt-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setIsCustomerDropdownOpen(!isCustomerDropdownOpen)
                    }
                    className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500 text-left cursor-pointer"
                  >
                    <span className="truncate">
                      {customerId === "none"
                        ? "Walk-in customer"
                        : customers.find((c) => String(c.id) === customerId)
                            ?.name || "Walk-in customer"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </button>

                  {isCustomerDropdownOpen && (
                    <div className="absolute right-0 top-10 z-50 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1.5 shadow-lg space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId("none");
                          setIsCustomerDropdownOpen(false);
                        }}
                        className="flex w-full items-center rounded px-2 py-1.5 text-xs hover:bg-emerald-50 text-left font-medium text-slate-700 cursor-pointer"
                      >
                        Walk-in customer
                      </button>
                      {filteredCustomers.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-slate-400">
                          No customers match — use New Customer
                        </p>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setCustomerId(String(c.id));
                              setIsCustomerDropdownOpen(false);
                              setCustomerSearch(c.name);
                            }}
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-emerald-50 text-left font-medium text-slate-700 cursor-pointer"
                          >
                            <span className="truncate">{c.name}</span>
                            {c.phone && (
                              <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                                {c.phone}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {loadingOutstanding && (
                  <div className="mt-2">
                    <InlineLoader label="Loading outstanding…" />
                  </div>
                )}
                {!loadingOutstanding && customerOutstanding !== null && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between items-center bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 text-xs text-amber-800 font-medium">
                      <span>Outstanding Debt</span>
                      <span className="font-semibold">
                        {formatCurrency(customerOutstanding)}
                      </span>
                    </div>
                    {paymentMode === "credit" && projectedDebt !== null && (
                      <div className="flex justify-between items-center bg-orange-50 border border-orange-200 rounded px-2.5 py-1.5 text-xs text-orange-800 font-medium">
                        <span>After This Bill (Credit)</span>
                        <span className="font-semibold">
                          {formatCurrency(projectedDebt)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {selectedCustomer &&
                  (selectedCustomer.acre ||
                    selectedCustomer.crop ||
                    selectedCustomer.village ||
                    selectedCustomer.taluk ||
                    selectedCustomer.district ||
                    selectedCustomer.pinCode) && (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      {[
                        selectedCustomer.acre && `Acre: ${selectedCustomer.acre}`,
                        selectedCustomer.crop && `Crop: ${selectedCustomer.crop}`,
                        selectedCustomer.village &&
                          `Village: ${selectedCustomer.village}`,
                        selectedCustomer.taluk && `Taluk: ${selectedCustomer.taluk}`,
                        selectedCustomer.district &&
                          `District: ${selectedCustomer.district}`,
                        selectedCustomer.pinCode &&
                          `PIN: ${selectedCustomer.pinCode}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}

                <div className="mt-2">
                  <Label className="text-xs">Purchase Order No.</Label>
                  <Input
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="Optional PO number"
                    className="mt-1 h-9"
                  />
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Quotation No.</Label>
                  <Input
                    value={quotationNumber}
                    onChange={(e) => setQuotationNumber(e.target.value)}
                    placeholder="Optional quotation number"
                    className="mt-1 h-9"
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Payment Terms</Label>
                    <Input
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                      placeholder="e.g. 30 DAYS"
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Delivery Note</Label>
                    <Input
                      value={deliveryNote}
                      onChange={(e) => setDeliveryNote(e.target.value)}
                      placeholder="Optional"
                      className="mt-1 h-9"
                    />
                  </div>
                  {needsEway && (
                    <>
                      <div>
                        <Label className="text-xs">e-Way Bill No.</Label>
                        <Input
                          value={ewayBillNo}
                          onChange={(e) => setEwayBillNo(e.target.value)}
                          placeholder="Required above ₹50,000"
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Vehicle No.</Label>
                        <Input
                          value={vehicleNo}
                          onChange={(e) => setVehicleNo(e.target.value)}
                          placeholder="Optional"
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Dispatched through</Label>
                        <Input
                          value={dispatchedThrough}
                          onChange={(e) => setDispatchedThrough(e.target.value)}
                          placeholder="e.g. ROAD"
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Destination</Label>
                        <Input
                          value={destination}
                          onChange={(e) => setDestination(e.target.value)}
                          placeholder="Optional"
                          className="mt-1 h-9"
                        />
                      </div>
                    </>
                  )}
                </div>
              {billType !== "retail" && (!customerId || customerId === "none") && (
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
              {billType === "retail" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Dispatched Through</Label>
                    <Select
                      value={dispatchedThrough || undefined}
                      onValueChange={setDispatchedThrough}
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Road">Road</SelectItem>
                        <SelectItem value="Rail">Rail</SelectItem>
                        <SelectItem value="Air">Air</SelectItem>
                        <SelectItem value="Sea">Sea</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Motor Vehicle No.</Label>
                    <Input
                      className="mt-1 h-9"
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value)}
                      placeholder="e.g. TN01AB1234"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Transporter Details</Label>
                    <Input
                      className="mt-1 h-9"
                      value={transporterName}
                      onChange={(e) => setTransporterName(e.target.value)}
                      placeholder="Transporter name"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-slate-600 font-medium">Payment</Label>
                  <Select
                    value={paymentMode}
                    onValueChange={(v) => {
                      const next = v as "cash" | "upi" | "credit" | "card" | "cheque";
                      setPaymentMode(next);
                      if (next !== "cash" && next !== "upi") {
                        setSplitCashUpi(false);
                        setCashAmountInput("");
                      }
                    }}
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
              {canSplitPayment && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={splitCashUpi}
                      onChange={(e) => {
                        setSplitCashUpi(e.target.checked);
                        if (!e.target.checked) setCashAmountInput("");
                      }}
                    />
                    Split Cash + UPI
                  </label>
                  {splitCashUpi && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Cash ₹</Label>
                        <Input
                          className="h-9 bg-white"
                          type="number"
                          min={0}
                          step="0.01"
                          value={cashAmountInput}
                          onChange={(e) => setCashAmountInput(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">UPI ₹ (auto)</Label>
                        <Input
                          className="h-9 bg-white"
                          type="number"
                          value={splitUpiAmount.toFixed(2)}
                          readOnly
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
              <Input
                className="h-9"
                placeholder="Operator name"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
              />
            </div>

            {belowCostCount > 0 && (
              <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {belowCostCount} item{belowCostCount > 1 ? "s" : ""} priced below
                cost — you can still complete the sale.
              </p>
            )}

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
