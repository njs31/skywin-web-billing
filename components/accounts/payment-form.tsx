"use client";

import { useTransition } from "react";
import { createPartyPayment } from "@/lib/actions/billing";
import type { Supplier } from "@/db/schema";
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

export function PaymentForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await createPartyPayment({
        type: "payment",
        supplierId: parseInt(fd.get("supplierId") as string, 10),
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
        <Label>Supplier *</Label>
        <Select name="supplierId" required>
          <SelectTrigger>
            <SelectValue placeholder="Select supplier" />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
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
            <SelectItem value="cheque">Cheque</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Reference No</Label>
        <Input name="referenceNo" />
      </div>
      <div>
        <Label>Notes</Label>
        <Input name="notes" />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Saving..." : "Record Payment"}
        </Button>
      </div>
    </form>
  );
}
