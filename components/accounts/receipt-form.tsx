"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createPartyPayment,
  getOutstandingSalesForCustomer,
  updateReceipt,
} from "@/lib/actions/billing";
import type { CustomerPickerOption } from "@/lib/queries/customers";
import { mergeReceiptBills, type ReceiptShare } from "@/lib/receipt-edit";
import { formatCurrency, toNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { BlockLoader } from "@/components/ui/page-loader";
import { CustomerSearchSelect } from "@/components/accounts/customer-search-select";

type OutstandingSale = {
  id: number;
  invoiceNo: string;
  date: Date | string;
  grandTotal: string;
  paidAmount: string | null;
  balance: string;
};

type ReceiptMode = "cash" | "upi" | "credit" | "card" | "cheque" | "neft";

export type ReceiptEditInitial = {
  id: number;
  customerId: number;
  voucherNo: string;
  amount: string;
  paymentMode: ReceiptMode;
  referenceNo: string;
  notes: string;
  requireAllocation: boolean;
  allocations: Record<number, string>;
  shares: ReceiptShare[];
};

export function ReceiptForm({
  nextVoucherNo,
  initialCustomer,
  initialSaleId,
  editing,
}: {
  nextVoucherNo?: string;
  initialCustomer?: CustomerPickerOption | null;
  initialSaleId?: number;
  editing?: ReceiptEditInitial;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerPickerOption | null>(initialCustomer ?? null);
  const [customerId, setCustomerId] = useState(
    editing?.customerId
      ? String(editing.customerId)
      : initialCustomer
        ? String(initialCustomer.id)
        : ""
  );
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [paymentMode, setPaymentMode] = useState<ReceiptMode>(
    editing?.paymentMode ?? "cash"
  );
  const [referenceNo, setReferenceNo] = useState(editing?.referenceNo ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [bills, setBills] = useState<OutstandingSale[]>([]);
  const [allocations, setAllocations] = useState<Record<number, string>>(
    editing?.allocations ?? {}
  );
  const [error, setError] = useState("");
  const [loadingBills, setLoadingBills] = useState(
    Boolean(editing?.customerId || initialCustomer)
  );

  const onCustomerChange = (value: string) => {
    setCustomerId(value);
    setBills([]);
    setError("");
    if (!value) {
      setLoadingBills(false);
      setAllocations({});
      return;
    }
    setLoadingBills(true);
    if (editing && value === String(editing.customerId)) {
      setAllocations(editing.allocations);
    } else {
      setAllocations({});
    }
  };

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    getOutstandingSalesForCustomer(parseInt(customerId, 10))
      .then((rows) => {
        if (cancelled) return;
        const sameReceipt =
          editing && customerId === String(editing.customerId);
        const loaded = rows as OutstandingSale[];
        setBills(
          sameReceipt ? mergeReceiptBills(loaded, editing.shares) : loaded
        );
        if (sameReceipt) return;
        if (initialSaleId) {
          const bill = loaded.find((row) => row.id === initialSaleId);
          if (bill) {
            const due = toNumber(bill.balance).toFixed(2);
            setAllocations({ [bill.id]: due });
            setAmount(due);
          } else {
            setAllocations({});
          }
        } else {
          setAllocations({});
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this customer's invoices.");
      })
      .finally(() => {
        if (!cancelled) setLoadingBills(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, initialSaleId, editing]);

  const allocatedTotal = useMemo(
    () =>
      Object.values(allocations).reduce(
        (sum, value) => sum + (parseFloat(value) || 0),
        0
      ),
    [allocations]
  );

  const autoAllocate = () => {
    const target = parseFloat(amount) || 0;
    if (target <= 0 || bills.length === 0) return;
    let remaining = target;
    const next: Record<number, string> = {};
    for (const bill of bills) {
      if (remaining <= 0) break;
      const balance = toNumber(bill.balance);
      const take = Math.min(balance, remaining);
      if (take > 0) {
        next[bill.id] = take.toFixed(2);
        remaining = Math.round((remaining - take) * 100) / 100;
      }
    }
    setAllocations(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const receiptAmount = parseFloat(amount);
    if (!customerId || !receiptAmount || receiptAmount <= 0) {
      setError("Customer and amount are required.");
      return;
    }

    const allocationRows = Object.entries(allocations)
      .map(([saleId, value]) => ({
        saleId: parseInt(saleId, 10),
        amount: parseFloat(value) || 0,
      }))
      .filter((row) => row.amount > 0);

    const requireAllocation = editing ? editing.requireAllocation : true;
    if (allocationRows.length === 0 && requireAllocation) {
      setError("Allocate the receipt to at least one outstanding invoice.");
      return;
    }

    const total = allocationRows.reduce((sum, row) => sum + row.amount, 0);
    if (allocationRows.length > 0 && Math.abs(total - receiptAmount) > 0.01) {
      setError("Allocation total must equal the receipt amount.");
      return;
    }

    startTransition(async () => {
      if (editing) {
        const result = await updateReceipt(editing.id, {
          customerId: parseInt(customerId, 10),
          amount: receiptAmount,
          paymentMode,
          referenceNo: referenceNo || undefined,
          notes: notes || undefined,
          allocations: allocationRows,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/accounts/receipts/${editing.id}`);
        router.refresh();
        return;
      }

      try {
        await createPartyPayment({
          type: "receipt",
          customerId: parseInt(customerId, 10),
          amount: receiptAmount,
          paymentMode,
          referenceNo: referenceNo || undefined,
          notes: notes || undefined,
          allocations: allocationRows,
        });
        setCustomerId("");
        setSelectedCustomer(null);
        setAmount("");
        setReferenceNo("");
        setNotes("");
        setAllocations({});
        setBills([]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save receipt");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {editing ? (
          <div>
            <Label>Voucher number</Label>
            <Input value={editing.voucherNo} readOnly className="bg-slate-50 font-mono" />
          </div>
        ) : nextVoucherNo ? (
          <div>
            <Label>Voucher number</Label>
            <Input value={nextVoucherNo} readOnly className="bg-slate-50 font-mono" />
            <p className="mt-1 text-[10px] text-slate-500">
              Assigned on save — may skip ahead if another receipt is recorded first.
            </p>
          </div>
        ) : null}
        <div>
          <Label>Customer *</Label>
          <CustomerSearchSelect
            selected={selectedCustomer}
            onSelect={(customer) => {
              setSelectedCustomer(customer);
              onCustomerChange(customer ? String(customer.id) : "");
            }}
          />
        </div>
        <div>
          <Label>Amount *</Label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Payment Mode</Label>
          <Select
            value={paymentMode}
            onValueChange={(v) => setPaymentMode(v as ReceiptMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="neft">NEFT</SelectItem>
              {paymentMode === "credit" ? (
                <SelectItem value="credit">Credit</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Reference No</Label>
          <Input
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="UPI ref, cheque no."
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {customerId && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Allocate to outstanding invoices
              </p>
              {editing && !editing.requireAllocation ? (
                <p className="text-xs text-slate-500">
                  Leave this blank to keep the receipt as an advance.
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Allocated: {formatCurrency(allocatedTotal)} /{" "}
                {formatCurrency(parseFloat(amount) || 0)}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={autoAllocate}>
                Auto-allocate
              </Button>
            </div>
          </div>
          {loadingBills ? (
            <BlockLoader label="Loading invoices…" className="min-h-[80px] border-0 bg-slate-50" />
          ) : bills.length === 0 ? (
            <p className="text-sm text-slate-400">No outstanding invoices for this customer.</p>
          ) : (
            <div className="space-y-2">
              {bills.map((bill) => (
                <div
                  key={bill.id}
                  className="grid grid-cols-1 items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm sm:grid-cols-4"
                >
                  <div className="sm:col-span-2">
                    <p className="font-medium">{bill.invoiceNo}</p>
                    <p className="text-xs text-slate-500">
                      Balance {formatCurrency(bill.balance)}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      max={toNumber(bill.balance)}
                      placeholder="Allocate ₹"
                      value={allocations[bill.id] ?? ""}
                      onChange={(e) =>
                        setAllocations((prev) => ({
                          ...prev,
                          [bill.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : editing ? "Save changes" : "Record Receipt"}
      </Button>
    </form>
  );
}
