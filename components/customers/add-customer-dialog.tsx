"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Customer } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { CustomerForm } from "@/components/customers/customer-form";

type AddCustomerDialogProps = {
  onCreated?: (customer: Customer) => void;
  defaultName?: string;
  defaultPhone?: string;
  triggerLabel?: string;
  compactTrigger?: boolean;
};

export function AddCustomerDialog({
  onCreated,
  defaultName = "",
  defaultPhone = "",
  triggerLabel = "New Customer",
  compactTrigger = false,
}: AddCustomerDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size={compactTrigger ? "sm" : "default"}
        variant={compactTrigger ? "outline" : "default"}
        onClick={() => setOpen(true)}
        className={
          compactTrigger
            ? "h-9 gap-1"
            : "bg-emerald-600 hover:bg-emerald-700"
        }
      >
        <Plus className="h-3.5 w-3.5" />
        {triggerLabel}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Customer</h3>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CustomerForm
              compact
              defaultName={defaultName}
              defaultPhone={defaultPhone}
              onSuccess={(customer) => {
                onCreated?.(customer);
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
