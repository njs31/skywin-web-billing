"use client";

import { useState, useTransition } from "react";
import { createSupplier, updateSupplier } from "@/lib/actions/suppliers";
import type { CreateSupplierInput } from "@/lib/queries/suppliers";
import type { Supplier } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { PinConfirmDialog } from "@/components/suppliers/pin-confirm-dialog";

type SupplierFormProps = {
  supplier?: Supplier;
  onSuccess?: () => void;
};

export function SupplierForm({ supplier, onSuccess }: SupplierFormProps) {
  const router = useRouter();
  const isEdit = Boolean(supplier);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingSave, setPendingSave] = useState<CreateSupplierInput | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError("");
    setSuccess("");

    const payload: CreateSupplierInput = {
      name: String(fd.get("name") || ""),
      gstin: String(fd.get("gstin") || "") || undefined,
      pan: String(fd.get("pan") || "") || undefined,
      address: String(fd.get("address") || "") || undefined,
      city: String(fd.get("city") || "") || undefined,
      state: String(fd.get("state") || "") || undefined,
      pinCode: String(fd.get("pinCode") || "") || undefined,
      phone: String(fd.get("phone") || "") || undefined,
    };

    if (isEdit) {
      setPendingSave(payload);
      setPinOpen(true);
      return;
    }

    startTransition(async () => {
      try {
        await createSupplier(payload);
        setSuccess("Supplier added. Available in Purchase Entry.");
        form.reset();
        router.refresh();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save supplier");
      }
    });
  };

  const confirmEdit = async (pin: string) => {
    if (!supplier || !pendingSave) return;
    await updateSupplier(supplier.id, pendingSave, pin);
    setPinOpen(false);
    setPendingSave(null);
    setSuccess("Supplier updated.");
    router.refresh();
    onSuccess?.();
  };

  const idPrefix = isEdit ? `edit-${supplier!.id}` : "new";

  return (
    <>
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
          <Label htmlFor={`${idPrefix}-name`}>Name *</Label>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            required
            defaultValue={supplier?.name ?? ""}
            placeholder="Supplier / company name"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${idPrefix}-gstin`}>GST</Label>
            <Input
              id={`${idPrefix}-gstin`}
              name="gstin"
              defaultValue={supplier?.gstin ?? ""}
              placeholder="15-character GSTIN"
              maxLength={15}
              className="uppercase"
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-pan`}>PAN Card (Optional)</Label>
            <Input
              id={`${idPrefix}-pan`}
              name="pan"
              defaultValue={supplier?.pan ?? ""}
              placeholder="ABCDE1234F"
              maxLength={10}
              className="uppercase"
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`${idPrefix}-address`}>Address</Label>
          <Input
            id={`${idPrefix}-address`}
            name="address"
            defaultValue={supplier?.address ?? ""}
            placeholder="Street / area"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor={`${idPrefix}-city`}>City</Label>
            <Input
              id={`${idPrefix}-city`}
              name="city"
              defaultValue={supplier?.city ?? ""}
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-state`}>State</Label>
            <Input
              id={`${idPrefix}-state`}
              name="state"
              defaultValue={supplier?.state ?? ""}
              placeholder="e.g. Tamil Nadu"
            />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-pin`}>PIN Code</Label>
            <Input
              id={`${idPrefix}-pin`}
              name="pinCode"
              defaultValue={supplier?.pinCode ?? ""}
              inputMode="numeric"
              maxLength={6}
              placeholder="6 digits"
            />
          </div>
        </div>

        <div>
          <Label htmlFor={`${idPrefix}-phone`}>Mobile Number</Label>
          <Input
            id={`${idPrefix}-phone`}
            name="phone"
            type="tel"
            inputMode="numeric"
            defaultValue={supplier?.phone ?? ""}
            placeholder="10-digit mobile"
            maxLength={15}
          />
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700"
        >
          {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Supplier"}
        </Button>
      </form>

      <PinConfirmDialog
        open={pinOpen}
        title="Confirm edit"
        description="Enter the confirmation PIN to save supplier changes."
        confirmLabel="Save"
        onClose={() => {
          setPinOpen(false);
          setPendingSave(null);
        }}
        onConfirm={confirmEdit}
      />
    </>
  );
}
