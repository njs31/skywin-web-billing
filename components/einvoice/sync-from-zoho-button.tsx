"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncStatusFromZoho } from "@/lib/actions/einvoice";

/**
 * Pulls the current e-Invoice/e-Way Bill status from Zoho without
 * pushing anything — for a case our own push flow never sees on its
 * own: someone generated a real e-way bill directly on the government
 * portal, or changed something straight in Zoho's UI, and it needs to
 * reach our own database too.
 */
export function SyncFromZohoButton({ saleId }: { saleId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string>("");

  const sync = () => {
    setResult("");
    startTransition(async () => {
      try {
        const res = await syncStatusFromZoho(saleId);
        setResult(
          res.einvoiceFound || res.ewbFound
            ? "Found and saved."
            : "Checked — Zoho has nothing new."
        );
        router.refresh();
      } catch (e) {
        setResult(e instanceof Error ? e.message : "Sync failed.");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        className="text-[10px] text-slate-500 underline disabled:opacity-50"
        onClick={sync}
        disabled={isPending}
      >
        {isPending ? "Checking Zoho…" : "Sync from Zoho"}
      </button>
      {result && <span className="text-[10px] text-slate-500">{result}</span>}
    </div>
  );
}
