"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createPartyPayment,
  getOutstandingSalesForCustomer,
} from "@/lib/actions/billing";
import type { Customer } from "@/db/schema";
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

type OutstandingSale = {
  id: number;
  invoiceNo: string;
  date: Date | string;
  grandTotal: string;
  paidAmount: string | null;
  balance: string;
};

export function ReceiptForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card" | "cheque">(
    "cash"
  );
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [bills, setBills] = useState<OutstandingSale[]>([]);
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [loadingBills, setLoadingBills] = useState(false);

  useEffect(() => {
    if (!customerId) {
      setBills([]);
      setAllocations({});
      return;
    }
    let cancelled = false;
    setLoadingBills(true);
    getOutstandingSalesForCustomer(parseInt(customerId, 10))
      .then((rows) => {
        if (!cancelled) {
          setBills(rows as OutstandingSale[]);
          setAllocations({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBills(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

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

    if (allocationRows.length === 0) {
      setError("Allocate the receipt to at least one outstanding invoice.");
      return;
    }

    const total = allocationRows.reduce((sum, row) => sum + row.amount, 0);
    if (Math.abs(total - receiptAmount) > 0.01) {
      setError("Allocation total must equal the receipt amount.");
      return;
    }

    startTransition(async () => {
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
        <div>
          <Label>Customer *</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            onValueChange={(v) =>
              setPaymentMode(v as "cash" | "upi" | "card" | "cheque")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
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
            <p className="text-sm font-semibold text-slate-800">
              Allocate to outstanding invoices
            </p>
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
            <p className="text-sm text-slate-400">Loading invoices...</p>
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
        {isPending ? "Saving..." : "Record Receipt"}
      </Button>
    </form>
  );
}
