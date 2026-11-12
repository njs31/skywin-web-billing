"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createFieldOfficer,
  deleteFieldOfficer,
  setFieldOfficerAccess,
  updateFieldOfficer,
} from "@/lib/actions/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabel } from "@/lib/user-roles";

export type OfficerRow = {
  id: number;
  name: string;
  phone: string;
  role: string;
  access: boolean;
  createdAt: Date | string | null;
  farmers: number;
};

const PAGE_SIZE = 12;

function mobileOf(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? digits : "";
}

function pageNumbers(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const numbers: number[] = [];
  for (let n = Math.max(1, end - 4); n <= end; n++) numbers.push(n);
  return numbers;
}

export function OfficersPanel({ officers }: { officers: OfficerRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<OfficerRow | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    if (!needle) return officers;
    return officers.filter((officer) => {
      const mobile = mobileOf(officer.phone);
      const haystack = `${officer.name} ${roleLabel(officer.role)} ${mobile}`.toLowerCase();
      if (haystack.includes(needle)) return true;
      return digits.length >= 2 && mobile.includes(digits);
    });
  }, [officers, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const from = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const numbers = pageNumbers(currentPage, pages);

  function resetForm() {
    setEditing(null);
    setName("");
    setPhone("");
    setError("");
  }

  function startEdit(officer: OfficerRow) {
    setEditing(officer);
    setName(officer.name);
    const digits = officer.phone.replace(/\D/g, "");
    setPhone(digits.length === 10 ? officer.phone : "");
    setError("");
  }

  function submit() {
    setError("");
    start(async () => {
      const input = { name, phone };
      const res = editing
        ? await updateFieldOfficer(editing.id, input)
        : await createFieldOfficer(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  function toggleAccess(officer: OfficerRow) {
    setBusyId(officer.id);
    start(async () => {
      try {
        await setFieldOfficerAccess(officer.id, !officer.access);
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  function remove(officer: OfficerRow) {
    const assigned = officer.farmers > 0 ? ` ${officer.farmers} assigned farmer(s) will be unassigned.` : "";
    const mobile = mobileOf(officer.phone);
    if (!window.confirm(`Delete ${officer.name}${mobile ? ` (${mobile})` : ""}?${assigned}`)) return;
    setError("");
    setBusyId(officer.id);
    start(async () => {
      try {
        const res = await deleteFieldOfficer(officer.id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (editing?.id === officer.id) resetForm();
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form
        className="rounded-2xl border border-[#1E3317]/10 bg-white p-4 md:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <h3 className="shrink-0 font-semibold lg:mb-2">
            {editing ? `Edit ${editing.name}` : "Add field officer"}
          </h3>
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Mobile</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit number"
                inputMode="numeric"
                required
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add officer"}
            </Button>
            {editing ? (
              <Button type="button" variant="outline" disabled={pending} onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </form>

      <div className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-[#1E3317]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                  setPage(1);
                }
              }}
              placeholder="Search name, mobile, or role"
              aria-label="Search officers"
              className="h-10 w-full rounded-xl border border-[#1E3317]/15 bg-[#F7F6F1] px-3 pr-10 text-sm text-[#29332C] outline-none focus:border-[#1E3317]/30 focus:bg-white focus:ring-2 focus:ring-[#B8D94A]"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setPage(1);
                }}
                className="absolute inset-y-0 right-1 flex w-8 items-center justify-center rounded-lg text-[#5E6B62] hover:bg-white"
              >
                ×
              </button>
            ) : null}
          </div>
          <p className="text-xs tabular-nums text-[#5E6B62]">
            {filtered.length === 0
              ? "0 officers"
              : `${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")} of ${filtered.length.toLocaleString("en-IN")}`}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-[#1E3317]">
              {query.trim() ? "No officers match" : "No field officers yet"}
            </p>
            <p className="mt-1 text-sm text-[#5E6B62]">
              {query.trim()
                ? "Try another name, mobile number, or role."
                : "Add an officer above so they can sign into the app."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-[#F7F6F1] text-left text-xs uppercase tracking-wide text-[#2E4A22]/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Billing role</th>
                  <th className="px-4 py-3 font-medium">Farmers</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 font-medium">App access</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((officer) => {
                  const busy = pending && busyId === officer.id;
                  const mobile = mobileOf(officer.phone);
                  const protectedAccount = mobile === "9999999999";
                  const canDelete = officer.role === "sales_officer" && !protectedAccount;
                  return (
                    <tr
                      key={officer.id}
                      className={`border-t border-[#1E3317]/10 ${editing?.id === officer.id ? "bg-[#B8D94A]/15" : "hover:bg-[#F7F6F1]/80"}`}
                    >
                      <td className="px-4 py-3 font-semibold text-[#1E3317]">{officer.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{mobile || "—"}</td>
                      <td className="px-4 py-3">{roleLabel(officer.role)}</td>
                      <td className="px-4 py-3 tabular-nums">{Number(officer.farmers) || 0}</td>
                      <td className="px-4 py-3 text-[#2E4A22]/60">
                        {officer.createdAt ? new Date(officer.createdAt).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleAccess(officer)}
                          className={
                            officer.access
                              ? "rounded-full bg-[#B8D94A]/40 px-3 py-1 text-xs font-semibold text-[#1E3317] hover:bg-[#B8D94A]/60"
                              : "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                          }
                        >
                          {busy ? "…" : officer.access ? "Can log in · Revoke" : "Blocked · Restore"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy || protectedAccount}
                            onClick={() => startEdit(officer)}
                          >
                            Edit
                          </Button>
                          {canDelete ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={busy}
                              onClick={() => remove(officer)}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-[#1E3317]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#5E6B62]">
              Page {currentPage.toLocaleString("en-IN")} of {pages.toLocaleString("en-IN")}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              {numbers[0] > 1 ? <span className="px-1 text-xs text-[#5E6B62]">…</span> : null}
              {numbers.map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setPage(number)}
                  aria-current={number === currentPage ? "page" : undefined}
                  className={
                    number === currentPage
                      ? "h-8 min-w-8 rounded-lg bg-[#1E3317] px-2 text-xs font-semibold text-white"
                      : "h-8 min-w-8 rounded-lg px-2 text-xs font-semibold text-[#1E3317] hover:bg-[#F7F6F1]"
                  }
                >
                  {number}
                </button>
              ))}
              {numbers[numbers.length - 1] < pages ? <span className="px-1 text-xs text-[#5E6B62]">…</span> : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
