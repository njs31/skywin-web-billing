"use client";

import { Button } from "@/components/ui/button";

/** Compact inline failure for the Invoices segment — never a raw error. */
export default function InvoicesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-sm text-slate-500">
          Manage sales invoices, payments, and reports.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">
          Unable to load invoices.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
