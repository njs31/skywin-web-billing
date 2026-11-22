"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decideFieldDeletion } from "@/lib/actions/field-deletions";
import { buttonClass, Badge, Notice } from "@/components/field/kit";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt } from "@/lib/field-i18n";

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

function StatusPill({ status }: { status: string }) {
  const d = useFieldText().deletions;
  if (status === "pending") return <Badge tone="amber">{d.stWaiting}</Badge>;
  if (status === "deleted") return <Badge tone="red">{d.stDeleted}</Badge>;
  return <Badge tone="grey">{d.stRejected}</Badge>;
}

export function DeletionsPanel({ requests }: { requests: DeletionRow[] }) {
  const router = useRouter();
  const d = useFieldText().deletions;
  const locale = fieldLocale(useFieldLang());
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");

  const decide = (row: DeletionRow, decision: "delete" | "reject") => {
    const who = `${row.name || d.thisFarmer} (+91 ${row.phone})`;
    const ok = window.confirm(fmt(decision === "delete" ? d.confirmDelete : d.confirmReject, { who }));
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
      {error ? <Notice tone="red">{error}</Notice> : null}

      <section className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#1E3317]/8 px-4 py-3 md:px-5">
          <h2 className="text-sm font-bold text-[#1E3317]">{d.waiting}</h2>
          <Badge tone={pending.length ? "amber" : "grey"}>{pending.length}</Badge>
        </div>
        {pending.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[#5E6B62] md:px-5">{d.noneWaiting}</p>
        ) : (
          <ul className="divide-y divide-[#1E3317]/10">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {row.customerIds[0] ? (
                      <Link href={`/field/farmers/${row.customerIds[0]}`} className="hover:underline">
                        {row.name || d.colFarmer}
                      </Link>
                    ) : (
                      row.name || d.noProfile
                    )}
                  </p>
                  <p className="text-sm text-[#2E4A22]/70">
                    +91 {row.phone}
                    {row.village ? ` · ${row.village}` : ""} · {fmt(d.asked, { date: when(row.requestedAt) })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={buttonClass("secondary", "sm")} disabled={busy === row.id} onClick={() => decide(row, "reject")}>
                    {d.turnDown}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-xl bg-[#8E3B34] px-4 text-xs font-semibold text-white hover:bg-[#7A322C] disabled:opacity-45"
                    disabled={busy === row.id}
                    onClick={() => decide(row, "delete")}
                  >
                    {busy === row.id ? d.working : d.proceed}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length ? (
        <section className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm">
          <div className="border-b border-[#1E3317]/8 px-4 py-3 md:px-5">
            <h2 className="text-sm font-bold text-[#1E3317]">{d.history}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-[#F7F6F1] text-left text-xs uppercase tracking-wide text-[#2E4A22]/60">
                <tr>
                  <th className="px-4 py-3 font-medium">{d.colFarmer}</th>
                  <th className="px-4 py-3 font-medium">{d.colPhone}</th>
                  <th className="px-4 py-3 font-medium">{d.colAsked}</th>
                  <th className="px-4 py-3 font-medium">{d.colResult}</th>
                  <th className="px-4 py-3 font-medium">{d.colBy}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E3317]/10">
                {done.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{row.name || d.colFarmer}</td>
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
