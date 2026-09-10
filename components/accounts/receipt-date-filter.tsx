"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * From/To day filter for Receipt History. Applying navigates with `from` and
 * `to` search params (and drops `page`, so the filtered list starts at page 1);
 * the server reads them in `getReceipts` / `getReceiptCount`.
 *
 * The page gives this a `key` of the applied range, so it remounts — and the
 * inputs re-seed from props — whenever the URL range changes.
 */
export function ReceiptDateFilter({
  from = "",
  to = "",
}: {
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  const dirty = fromValue !== from || toValue !== to;
  const hasFilter = Boolean(from || to);

  function apply() {
    const params = new URLSearchParams();
    if (fromValue) params.set("from", fromValue);
    if (toValue) params.set("to", toValue);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/accounts/receipts?${qs}` : "/accounts/receipts");
    });
  }

  function clear() {
    setFromValue("");
    setToValue("");
    startTransition(() => {
      router.push("/accounts/receipts");
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <Label htmlFor="receipt-from" className="text-xs text-slate-500">
          From
        </Label>
        <Input
          id="receipt-from"
          type="date"
          value={fromValue}
          max={toValue || undefined}
          onChange={(e) => setFromValue(e.target.value)}
          className="w-[10rem]"
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="receipt-to" className="text-xs text-slate-500">
          To
        </Label>
        <Input
          id="receipt-to"
          type="date"
          value={toValue}
          min={fromValue || undefined}
          onChange={(e) => setToValue(e.target.value)}
          className="w-[10rem]"
        />
      </div>
      <Button size="sm" onClick={apply} disabled={isPending || !dirty}>
        Apply
      </Button>
      {(hasFilter || fromValue || toValue) && (
        <Button
          size="sm"
          variant="outline"
          onClick={clear}
          disabled={isPending}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
