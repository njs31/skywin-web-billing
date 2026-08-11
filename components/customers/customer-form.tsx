"use client";

import { useState, useTransition } from "react";
import { createCustomer } from "@/lib/actions/billing";
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

type CustomerFormProps = {
  onSuccess?: (customer: Customer) => void;
  compact?: boolean;
  defaultName?: string;
  defaultPhone?: string;
};

export function CustomerForm({
  onSuccess,
  compact = false,
  defaultName = "",
  defaultPhone = "",
}: CustomerFormProps) {
  const router = useRouter();
  const [type, setType] = useState<"retail" | "wholesale" | "farmer">("retail");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(!compact);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const customer = await createCustomer({
          name: fd.get("name") as string,
          phone: (fd.get("phone") as string) || undefined,
          gstin: (fd.get("gstin") as string) || undefined,
          address: (fd.get("address") as string) || undefined,
          membershipNo: (fd.get("membershipNo") as string) || undefined,
          type,
          creditLimit: parseFloat((fd.get("creditLimit") as string) || "0"),
        });
        form.reset();
        setType("retail");
        if (onSuccess) {
          onSuccess(customer);
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save customer");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <div>
        <Label>Name *</Label>
        <Input name="name" required defaultValue={defaultName} />
      </div>
      <div>
        <Label>Phone</Label>
        <Input name="phone" defaultValue={defaultPhone} />
      </div>
      <div>
        <Label>Type</Label>
        <Select
          value={type}
          onValueChange={(v) =>
            setType(v as "retail" | "wholesale" | "farmer")
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="retail">Retail</SelectItem>
            <SelectItem value="wholesale">Wholesale</SelectItem>
            <SelectItem value="farmer">Farmer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>GSTIN</Label>
        <Input name="gstin" placeholder="15-character GST number" />
        <p className="mt-1 text-[10px] text-slate-500">
          Only one company is allowed per GST number.
        </p>
      </div>
      <div>
        <Label>Credit Limit</Label>
        <Input name="creditLimit" type="number" min={0} defaultValue={0} />
      </div>

      {compact && !showMore ? (
        <button
          type="button"
          className="text-xs font-medium text-emerald-700 hover:underline"
          onClick={() => setShowMore(true)}
        >
          More details (address, membership)
        </button>
      ) : (
        <>
          <div>
            <Label>Membership Number</Label>
            <Input name="membershipNo" placeholder="Optional membership ID" />
          </div>
          <div>
            <Label>Address</Label>
            <Input name="address" />
          </div>
        </>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Add Customer"}
      </Button>
    </form>
  );
}
