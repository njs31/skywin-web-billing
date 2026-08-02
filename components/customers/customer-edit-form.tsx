"use client";

import { useState, useTransition } from "react";
import { updateCustomer } from "@/lib/actions/billing";
import type { Customer } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [gstin, setGstin] = useState(customer.gstin ?? "");
  const [membershipNo, setMembershipNo] = useState(customer.membershipNo ?? "");

  const save = () => {
    setError("");
    startTransition(async () => {
      try {
        await updateCustomer(customer.id, {
          name: customer.name,
          phone: phone.trim() || undefined,
          gstin: gstin.trim() || undefined,
          membershipNo: membershipNo.trim() || undefined,
          address: customer.address ?? undefined,
          type: customer.type,
          creditLimit: parseFloat(customer.creditLimit ?? "0") || 0,
        });
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update customer");
      }
    });
  };

  if (!editing) {
    return (
      <div className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Membership No</p>
            <p className="font-medium">{customer.membershipNo || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Mobile Number</p>
            <p className="font-medium">{customer.phone || "-"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">GST Number</p>
            <p className="font-medium font-mono text-xs">{customer.gstin || "-"}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit Details
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Membership Number</Label>
          <Input value={membershipNo} onChange={(e) => setMembershipNo(e.target.value)} />
        </div>
        <div>
          <Label>Mobile Number</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label>GST Number</Label>
          <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={save}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            setEditing(false);
            setPhone(customer.phone ?? "");
            setGstin(customer.gstin ?? "");
            setMembershipNo(customer.membershipNo ?? "");
            setError("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
