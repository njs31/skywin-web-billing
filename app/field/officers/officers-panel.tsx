"use client";

import { useState, useTransition } from "react";
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

export type OfficerRow = {
  id: number;
  name: string;
  phone: string;
  access: boolean;
  createdAt: Date | string | null;
  farmers: number;
};

export function OfficersPanel({ officers }: { officers: OfficerRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<OfficerRow | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  function resetForm() {
    setEditing(null);
    setName("");
    setPhone("");
    setError("");
  }

  function startEdit(officer: OfficerRow) {
    setEditing(officer);
    setName(officer.name);
    setPhone(officer.phone);
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
    if (!window.confirm(`Delete ${officer.name} (${officer.phone})?${assigned}`)) return;
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
    <div className="space-y-6">
      <form
        className="max-w-lg space-y-3 rounded-2xl border border-[#1E3317]/10 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h3 className="font-semibold">{editing ? `Edit ${editing.name}` : "Add field officer"}</h3>
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save changes" : "Add officer"}
          </Button>
          {editing ? (
            <Button type="button" variant="outline" disabled={pending} onClick={resetForm}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#FFF7F5] text-left text-xs uppercase tracking-wide text-[#2E4A22]/60">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Farmers</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3">App access</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {officers.map((officer) => {
              const busy = pending && busyId === officer.id;
              return (
                <tr
                  key={officer.id}
                  className={`border-t border-[#1E3317]/10 ${editing?.id === officer.id ? "bg-[#B8D94A]/10" : ""}`}
                >
                  <td className="px-4 py-3 font-semibold">{officer.name}</td>
                  <td className="px-4 py-3">{officer.phone}</td>
                  <td className="px-4 py-3">{Number(officer.farmers) || 0}</td>
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
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => startEdit(officer)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() => remove(officer)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {officers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#2E4A22]/50">
                  No field officers yet. Add one above so they can sign into the app.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
