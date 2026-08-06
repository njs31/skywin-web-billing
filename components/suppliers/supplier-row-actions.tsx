"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { Supplier } from "@/db/schema";
import { deleteSupplier } from "@/lib/actions/suppliers";
import { Button } from "@/components/ui/button";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { PinConfirmDialog } from "@/components/suppliers/pin-confirm-dialog";

type SupplierRowActionsProps = {
  supplier: Supplier;
  showView?: boolean;
};

export function SupplierRowActions({
  supplier,
  showView = true,
}: SupplierRowActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const confirmDelete = async (pin: string) => {
    await deleteSupplier(supplier.id, pin);
    setDeleteOpen(false);
    router.push("/suppliers");
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {showView && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/suppliers/${supplier.id}`}>View</Link>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-200 text-red-700 hover:bg-red-50"
          onClick={() => setDeleteOpen(true)}
        >
          Delete
        </Button>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit Supplier</h3>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SupplierForm
              supplier={supplier}
              onSuccess={() => setEditOpen(false)}
            />
          </div>
        </div>
      )}

      <PinConfirmDialog
        open={deleteOpen}
        title="Delete supplier"
        description={`Enter the confirmation PIN to permanently delete “${supplier.name}”.`}
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
