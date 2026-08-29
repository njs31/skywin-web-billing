"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelSale } from "@/lib/actions/sales";
import { Button } from "@/components/ui/button";

export function CancelInvoiceButton({
  saleId,
  invoiceNo,
}: {
  saleId: number;
  invoiceNo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError("");
    startTransition(async () => {
      try {
        await cancelSale(saleId, reason);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to cancel invoice");
      }
    });
  };

  if (!open) {
    return (
      <Button
        variant="outline"
        className="border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        Cancel Invoice
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-medium text-red-800">
        Cancel {invoiceNo}? Stock is returned and the customer receipt reversed.
      </p>
      <input
        className="w-72 rounded border border-slate-300 px-2 py-1 text-sm"
        placeholder="Reason (required)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={isPending}
        >
          Keep
        </Button>
        <Button
          size="sm"
          className="bg-red-600 hover:bg-red-700"
          onClick={submit}
          disabled={isPending || reason.trim().length < 3}
        >
          {isPending ? "Cancelling…" : "Confirm cancel"}
        </Button>
      </div>
    </div>
  );
}
