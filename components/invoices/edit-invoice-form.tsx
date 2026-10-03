"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSale } from "@/lib/actions/sales";
import { searchProductBatches } from "@/lib/actions/products";
import {
  calculateGstBreakdown,
  applyRupeeRounding,
  isInterstateGst,
} from "@/lib/gst";
import { toNumber } from "@/lib/utils";
import { UNIT_OPTIONS } from "@/lib/units";
import type { ProductBatchSearchResult } from "@/lib/queries/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type EditableLine = {
  key: string;
  productId: number | null;
  name: string;
  customName: string;
  qty: string;
  rate: string;
  discountPercent: string;
  discountType: "percent" | "value";
  discountValue: string;
  gstRate: string;
  hsnCode: string;
  unit: string;
};

export type EditableCustomer = {
  id: number;
  name: string;
  phone: string | null;
  gstin: string | null;
};

let lineSeq = 0;
const nextKey = () => `line-${Date.now()}-${lineSeq++}`;

function lineAmount(l: EditableLine): number {
  const qty = toNumber(l.qty);
  const gross = qty * toNumber(l.rate);
  const disc =
    l.discountType === "percent"
      ? (gross * toNumber(l.discountPercent)) / 100
      : toNumber(l.discountValue);
  return Math.round((gross - disc) * 100) / 100;
}

export function EditInvoiceForm({
  saleId,
  invoiceNo,
  initialLines,
  initialCustomerId,
  initialCustomerName,
  initialPaymentMode,
  initialCashAmount,
  initialUpiAmount,
  initialPaidAmount,
  initialDiscountAmount,
  initialNotes,
  initialVehicleNo,
  initialTransporterName,
  initialTransporterGstin,
  initialDistanceKm,
  customers,
  businessStateCode,
}: {
  saleId: number;
  invoiceNo: string;
  initialLines: EditableLine[];
  initialCustomerId: number | null;
  initialCustomerName: string | null;
  initialPaymentMode: string;
  initialCashAmount: string;
  initialUpiAmount: string;
  initialPaidAmount: string;
  initialDiscountAmount: string;
  initialNotes: string | null;
  initialVehicleNo: string | null;
  initialTransporterName: string | null;
  initialTransporterGstin: string | null;
  initialDistanceKm: string | null;
  customers: EditableCustomer[];
  businessStateCode: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [lines, setLines] = useState<EditableLine[]>(initialLines);
  const [customerId, setCustomerId] = useState(
    initialCustomerId != null ? String(initialCustomerId) : ""
  );
  const [walkInName, setWalkInName] = useState(
    initialCustomerId != null ? "" : (initialCustomerName ?? "")
  );
  const [paymentMode, setPaymentMode] = useState(initialPaymentMode);
  const [cashAmount, setCashAmount] = useState(initialCashAmount);
  const [upiAmount, setUpiAmount] = useState(initialUpiAmount);
  const [paidAmount, setPaidAmount] = useState(initialPaidAmount);
  const [discountAmount, setDiscountAmount] = useState(initialDiscountAmount);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [vehicleNo, setVehicleNo] = useState(initialVehicleNo ?? "");
  const [transporterName, setTransporterName] = useState(
    initialTransporterName ?? ""
  );
  const [transporterGstin, setTransporterGstin] = useState(
    initialTransporterGstin ?? ""
  );
  const [distanceKm, setDistanceKm] = useState(initialDistanceKm ?? "");

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductBatchSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) ?? null,
    [customers, customerId]
  );
  const interstate = isInterstateGst(
    selectedCustomer?.gstin,
    businessStateCode
  );

  const totals = useMemo(() => {
    try {
      return applyRupeeRounding(
        calculateGstBreakdown(
          lines.map((l) => ({
            qty: toNumber(l.qty),
            rate: toNumber(l.rate),
            gstRate: toNumber(l.gstRate),
            discountType: l.discountType,
            discountValue:
              l.discountType === "percent"
                ? toNumber(l.discountPercent)
                : toNumber(l.discountValue),
          })),
          { billDiscount: toNumber(discountAmount), interstate }
        )
      );
    } catch {
      return null;
    }
  }, [lines, discountAmount, interstate]);

  function patchLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  async function runSearch(query: string) {
    setSearch(query);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchProductBatches(query.trim(), 10));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function addProductLine(p: ProductBatchSearchResult) {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        productId: p.productId,
        name: p.name,
        customName: "",
        qty: "1",
        rate: p.batchSaleRate || p.saleRate,
        discountPercent: p.discountPercent || "0",
        discountType: "percent",
        discountValue: "0",
        gstRate: p.gstRate,
        hsnCode: p.hsnCode || "",
        unit: p.unit,
      },
    ]);
    setSearch("");
    setResults([]);
  }

  function addCustomLine() {
    setLines((prev) => [
      ...prev,
      {
        key: nextKey(),
        productId: null,
        name: "",
        customName: "",
        qty: "1",
        rate: "0",
        discountPercent: "0",
        discountType: "percent",
        discountValue: "0",
        gstRate: "18",
        hsnCode: "",
        unit: "Pcs",
      },
    ]);
  }

  function save() {
    setError("");
    if (lines.length === 0) {
      setError("The invoice needs at least one line.");
      return;
    }
    startTransition(async () => {
      try {
        await updateSale({
          saleId,
          customerId: customerId ? Number(customerId) : undefined,
          customerName: customerId ? undefined : walkInName.trim() || undefined,
          paymentMode: paymentMode as
            | "cash"
            | "upi"
            | "credit"
            | "card"
            | "cheque"
            | "neft",
          discountAmount: toNumber(discountAmount),
          paidAmount: toNumber(paidAmount),
          cashAmount: toNumber(cashAmount),
          upiAmount: toNumber(upiAmount),
          notes: notes.trim() || undefined,
          vehicleNo: vehicleNo.trim() || undefined,
          transporterName: transporterName.trim() || undefined,
          transporterGstin: transporterGstin.trim() || undefined,
          distanceKm: distanceKm.trim() ? toNumber(distanceKm) : undefined,
          items: lines.map((l) => ({
            productId: l.productId,
            customName: l.customName.trim() || undefined,
            qty: toNumber(l.qty),
            rate: toNumber(l.rate),
            gstRate: toNumber(l.gstRate),
            discountPercent: toNumber(l.discountPercent),
            discountType: l.discountType,
            discountValue: toNumber(
              l.discountType === "percent" ? l.discountPercent : l.discountValue
            ),
            hsnCode: l.hsnCode.trim() || undefined,
            unit: l.productId ? undefined : l.unit.trim() || undefined,
          })),
        });
        router.push(`/invoices/${saleId}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save invoice");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Items — {invoiceNo}
            <span className="ml-2 text-xs font-normal text-slate-500">
              Stock is returned and re-allocated (FEFO) on save.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l) => (
            <div
              key={l.key}
              className="grid grid-cols-12 items-end gap-2 rounded-lg border border-slate-200 p-2"
            >
              <div className="col-span-12 sm:col-span-3">
                <Label className="text-xs">
                  {l.productId ? `Product${l.unit ? ` (${l.unit})` : ""}` : "Custom item"}
                </Label>
                {l.productId ? (
                  <p className="truncate text-sm font-medium">{l.name}</p>
                ) : (
                  <Input
                    value={l.customName}
                    onChange={(e) => patchLine(l.key, { customName: e.target.value })}
                    placeholder="Item name"
                  />
                )}
              </div>
              <div className="col-span-3 sm:col-span-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={l.qty}
                  onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <Label className="text-xs">Rate</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={l.rate}
                  onChange={(e) => patchLine(l.key, { rate: e.target.value })}
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <Label className="text-xs">Disc {l.discountType === "percent" ? "%" : "₹"}</Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={
                      l.discountType === "percent" ? l.discountPercent : l.discountValue
                    }
                    onChange={(e) =>
                      patchLine(
                        l.key,
                        l.discountType === "percent"
                          ? { discountPercent: e.target.value }
                          : { discountValue: e.target.value }
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    title="Toggle % / ₹"
                    onClick={() =>
                      patchLine(l.key, {
                        discountType: l.discountType === "percent" ? "value" : "percent",
                      })
                    }
                  >
                    {l.discountType === "percent" ? "%" : "₹"}
                  </Button>
                </div>
              </div>
              <div className="col-span-3 sm:col-span-1">
                <Label className="text-xs">GST%</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={l.gstRate}
                  onChange={(e) => patchLine(l.key, { gstRate: e.target.value })}
                />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-xs">Amount</Label>
                <p className="px-2 py-2 text-sm font-semibold">
                  ₹{lineAmount(l).toFixed(2)}
                </p>
              </div>
              <div className="col-span-6 sm:col-span-1">
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  className="text-red-600"
                  onClick={() => removeLine(l.key)}
                >
                  Remove
                </Button>
              </div>
              {!l.productId && (
                <>
                  <div className="col-span-12 sm:col-span-2">
                    <Label className="text-xs">HSN (required for custom items)</Label>
                    <Input
                      value={l.hsnCode}
                      onChange={(e) => patchLine(l.key, { hsnCode: e.target.value })}
                      placeholder="HSN code"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-2">
                    <Label className="text-xs">Unit (required for custom items)</Label>
                    <select
                      value={l.unit || "Pcs"}
                      onChange={(e) => patchLine(l.key, { unit: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2 pt-1">
            <div className="relative min-w-64 flex-1">
              <Input
                value={search}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="Add product — type 2+ letters to search"
              />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {results.map((p) => (
                    <button
                      key={`${p.productId}-${p.batchId ?? "nobatch"}`}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => addProductLine(p)}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        ₹{p.batchSaleRate || p.saleRate} · {p.unit} · Stock {p.batchQty}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searching && (
                <p className="mt-1 text-xs text-slate-400">Searching…</p>
              )}
            </div>
            <Button type="button" variant="outline" onClick={addCustomLine}>
              Add custom item
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer & payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Customer</Label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Walk-in (no ledger)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {!customerId && (
              <div>
                <Label>Walk-in name</Label>
                <Input
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="Printed on the bill"
                />
              </div>
            )}
            {selectedCustomer?.gstin && (
              <p className="text-xs text-slate-500">
                GSTIN {selectedCustomer.gstin}
                {interstate ? " — interstate (IGST)" : " — same state (CGST+SGST)"}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment mode</Label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {["cash", "upi", "credit", "card", "cheque", "neft"].map((m) => (
                    <option key={m} value={m} className="capitalize">
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Bill discount ₹</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Cash received</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>UPI received</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={upiAmount}
                  onChange={(e) => setUpiAmount(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label>Paid amount (credit bills)</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dispatch (optional)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vehicle no.</Label>
                <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
              </div>
              <div>
                <Label>Distance (km)</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </div>
              <div>
                <Label>Transporter</Label>
                <Input
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                />
              </div>
              <div>
                <Label>Transporter GSTIN</Label>
                <Input
                  value={transporterGstin}
                  onChange={(e) => setTransporterGstin(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">New total</CardTitle>
            </CardHeader>
            <CardContent>
              {totals ? (
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd>₹{totals.subtotal.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">GST</dt>
                    <dd>
                      ₹{(totals.cgst + totals.sgst + totals.igst).toFixed(2)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-base font-bold">
                    <dt>Grand total</dt>
                    <dd>₹{totals.grandTotal.toFixed(2)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-slate-400">Totals appear as you edit.</p>
              )}
              {error && (
                <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
              )}
              <Button
                className="mt-4 w-full"
                disabled={isPending}
                onClick={save}
              >
                {isPending ? "Saving…" : "Save invoice"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
