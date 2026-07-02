"use client";

import { useState, useTransition } from "react";
import { createCustomer } from "@/lib/actions/billing";
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

export function CustomerForm() {
  const router = useRouter();
  const [type, setType] = useState<"retail" | "wholesale" | "farmer">("retail");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        await createCustomer({
          name: fd.get("name") as string,
          phone: (fd.get("phone") as string) || undefined,
          gstin: (fd.get("gstin") as string) || undefined,
          address: (fd.get("address") as string) || undefined,
          type,
          creditLimit: parseFloat((fd.get("creditLimit") as string) || "0"),
        });
        router.refresh();
        (e.target as HTMLFormElement).reset();
        setType("retail");
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
        <Input name="name" required />
      </div>
      <div>
        <Label>Phone</Label>
        <Input name="phone" />
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
      <div>
        <Label>Address</Label>
        <Input name="address" />
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving..." : "Add Customer"}
      </Button>
    </form>
  );
}
