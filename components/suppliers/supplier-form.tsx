"use client";

import { useState, useTransition } from "react";
import { createSupplier } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";

export function SupplierForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError("");
    setSuccess("");

    startTransition(async () => {
      try {
        await createSupplier({
          name: String(fd.get("name") || ""),
          gstin: String(fd.get("gstin") || "") || undefined,
          pan: String(fd.get("pan") || "") || undefined,
          address: String(fd.get("address") || "") || undefined,
          city: String(fd.get("city") || "") || undefined,
          state: String(fd.get("state") || "") || undefined,
          pinCode: String(fd.get("pinCode") || "") || undefined,
          phone: String(fd.get("phone") || "") || undefined,
        });
        setSuccess("Supplier added. Available in Purchase Entry.");
        form.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save supplier");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {success}
        </p>
      )}

      <div>
        <Label htmlFor="supplier-name">Name *</Label>
        <Input id="supplier-name" name="name" required placeholder="Supplier / company name" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="supplier-gstin">GST</Label>
          <Input
            id="supplier-gstin"
            name="gstin"
            placeholder="15-character GSTIN"
            maxLength={15}
            className="uppercase"
          />
        </div>
        <div>
          <Label htmlFor="supplier-pan">PAN Card (Optional)</Label>
          <Input
            id="supplier-pan"
            name="pan"
            placeholder="ABCDE1234F"
            maxLength={10}
            className="uppercase"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="supplier-address">Address</Label>
        <Input id="supplier-address" name="address" placeholder="Street / area" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="supplier-city">City</Label>
          <Input id="supplier-city" name="city" />
        </div>
        <div>
          <Label htmlFor="supplier-state">State</Label>
          <Input id="supplier-state" name="state" placeholder="e.g. Tamil Nadu" />
        </div>
        <div>
          <Label htmlFor="supplier-pin">PIN Code</Label>
          <Input
            id="supplier-pin"
            name="pinCode"
            inputMode="numeric"
            maxLength={6}
            placeholder="6 digits"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="supplier-phone">Mobile Number</Label>
        <Input
          id="supplier-phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          placeholder="10-digit mobile"
          maxLength={15}
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full bg-emerald-600 hover:bg-emerald-700"
      >
        {isPending ? "Saving…" : "Add Supplier"}
      </Button>
    </form>
  );
}
