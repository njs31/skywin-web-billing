"use client";

import { useState, useTransition } from "react";
import { createPartyPayment } from "@/lib/actions/billing";
import type { Customer } from "@/db/schema";
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

export function AdvanceReceiptForm({
  customers,
  nextVoucherNo,
}: {
  customers: Customer[];
  nextVoucherNo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<
    "cash" | "upi" | "card" | "cheque" | "neft"
  >("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const receiptAmount = parseFloat(amount);
    if (!customerId || !receiptAmount || receiptAmount <= 0) {
      setError("Customer and amount are required.");
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
          notes: notes || "Advance receipt",
          allocations: [],
        });
        setCustomerId("");
        setAmount("");
        setReferenceNo("");
        setNotes("");
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save advance receipt"
        );
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-500">
        On-account receipt — not allocated to an invoice. The amount sits as
        customer credit against outstanding.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {nextVoucherNo ? (
          <div>
            <Label>Voucher number</Label>
            <Input
              value={nextVoucherNo}
              readOnly
              className="bg-slate-50 font-mono"
            />
          </div>
        ) : null}
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
              setPaymentMode(v as "cash" | "upi" | "card" | "cheque" | "neft")
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
              <SelectItem value="neft">NEFT</SelectItem>
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
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Advance / on-account"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Record Advance Receipt"}
      </Button>
    </form>
  );
}
