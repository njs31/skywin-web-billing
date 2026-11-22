"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decideFieldDeletion } from "@/lib/actions/field-deletions";
import { Button } from "@/components/ui/button";

export type DeletionRow = {
  id: number;
  name: string | null;
  phone: string;
  village: string | null;
  customerIds: number[];
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "pending"
      ? "bg-amber-100 text-amber-800"
      : status === "deleted"
        ? "bg-red-100 text-red-700"
        : "bg-[#EDF2E7] text-[#2E4A22]";
  const label = status === "pending" ? "Waiting" : status === "deleted" ? "Deleted" : "Turned down";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

export function DeletionsPanel({ requests }: { requests: DeletionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");

  const decide = (row: DeletionRow, decision: "delete" | "reject") => {
    const who = `${row.name || "this farmer"} (+91 ${row.phone})`;
    const ok =
      decision === "delete"
        ? window.confirm(`Delete the account of ${who}?\n\nTheir name, phone, address and farm details will be erased. This cannot be undone.`)
        : window.confirm(`Turn down the deletion request from ${who}? Their account stays as it is.`);
    if (!ok) return;
    setBusy(row.id);
    setError("");
    startTransition(async () => {
      const result = await decideFieldDeletion(row.id, decision);
      setBusy(null);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-2xl border border-[#1E3317]/10 bg-white">
        <div className="flex items-center justify-between border-b border-[#1E3317]/10 px-4 py-3 md:px-5">
          <h2 className="font-semibold">Waiting for you</h2>
          <span className="text-sm text-[#2E4A22]/60">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#2E4A22]/60 md:px-5">No requests waiting.</p>
        ) : (
          <ul className="divide-y divide-[#1E3317]/10">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {row.customerIds[0] ? (
                      <Link href={`/field/farmers/${row.customerIds[0]}`} className="hover:underline">
                        {row.name || "Farmer"}
                      </Link>
                    ) : (
                      row.name || "Farmer (no saved profile)"
                    )}
                  </p>
                  <p className="text-sm text-[#2E4A22]/70">
                    +91 {row.phone}
                    {row.village ? ` · ${row.village}` : ""} · asked {when(row.requestedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={busy === row.id} onClick={() => decide(row, "reject")}>
                    Turn down
                  </Button>
                  <Button type="button" variant="destructive" disabled={busy === row.id} onClick={() => decide(row, "delete")}>
                    {busy === row.id ? "Working…" : "Proceed"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length ? (
        <section className="rounded-2xl border border-[#1E3317]/10 bg-white">
          <div className="border-b border-[#1E3317]/10 px-4 py-3 md:px-5">
            <h2 className="font-semibold">History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-[#F7F6F1] text-left text-xs uppercase tracking-wide text-[#2E4A22]/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Farmer</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Asked</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E3317]/10">
                {done.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{row.name || "Farmer"}</td>
                    <td className="px-4 py-3">+91 {row.phone}</td>
                    <td className="px-4 py-3">{when(row.requestedAt)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-[#2E4A22]/70">
                      {row.decidedBy || "—"}
                      {row.decidedAt ? ` · ${when(row.decidedAt)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
