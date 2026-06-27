"use client";

import { useTransition } from "react";
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

export function ReceiptForm({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createPartyPayment({
        type: "receipt",
        customerId: parseInt(fd.get("customerId") as string, 10),
        amount: parseFloat(fd.get("amount") as string),
        paymentMode: fd.get("paymentMode") as "cash" | "upi" | "card" | "cheque",
        referenceNo: (fd.get("referenceNo") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
      });
      router.refresh();
      (e.target as HTMLFormElement).reset();
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Label>Customer *</Label>
        <Select name="customerId" required>
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
        <Input name="amount" type="number" min={0.01} step={0.01} required />
      </div>
      <div>
        <Label>Payment Mode</Label>
        <Select name="paymentMode" defaultValue="cash">
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
        <Input name="referenceNo" placeholder="UPI ref, cheque no." />
      </div>
      <div>
        <Label>Notes</Label>
        <Input name="notes" />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Saving..." : "Record Receipt"}
        </Button>
      </div>
    </form>
  );
}
