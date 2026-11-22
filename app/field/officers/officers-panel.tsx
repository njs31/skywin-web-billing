"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createFieldOfficer,
  deleteFieldOfficer,
  setFieldOfficerAccess,
  updateFieldOfficer,
} from "@/lib/actions/field";
import { Ban, CheckCircle2, Leaf, ShieldCheck, UserPlus, Users } from "lucide-react";
import { roleLabel } from "@/lib/user-roles";
import { Badge, EmptyState, MobileCard, Notice, PageHeader, SearchBox, StatCard, StatGrid, buttonClass, inputClass, labelClass, tableClass, tdClass, thClass, theadClass, trClass } from "@/components/field/kit";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

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
  const t = useFieldText();
  const o = t.officers;
  const locale = fieldLocale(useFieldLang());
  const role = (r: string) => (t.roles as Record<string, string>)[r] ?? roleLabel(r);
  const [access, setAccess] = useState<"all" | "on" | "off">("all");
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
    const byAccess = officers.filter((officer) => (access === "all" ? true : access === "on" ? officer.access : !officer.access));
    if (!needle) return byAccess;
    return byAccess.filter((officer) => {
      const mobile = mobileOf(officer.phone);
      const haystack = `${officer.name} ${roleLabel(officer.role)} ${mobile}`.toLowerCase();
      if (haystack.includes(needle)) return true;
      return digits.length >= 2 && mobile.includes(digits);
    });
  }, [officers, query, access]);

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
    const assigned = officer.farmers > 0 ? fmt(o.deleteUnassign, { n: officer.farmers }) : "";
    const mobile = mobileOf(officer.phone);
    if (!window.confirm(fmt(o.deleteConfirm, { name: officer.name, mobile: mobile ? ` (${mobile})` : "" }) + assigned)) return;
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

  const withAccess = officers.filter((officer) => officer.access).length;
  const farmersTotal = officers.reduce((sum, officer) => sum + (Number(officer.farmers) || 0), 0);
  const tabs = [
    { key: "all" as const, label: o.filterAll, count: officers.length },
    { key: "on" as const, label: o.filterAccess, count: withAccess },
    { key: "off" as const, label: o.filterBlocked, count: officers.length - withAccess },
  ];

  const accessButton = (officer: OfficerRow, busy: boolean) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => toggleAccess(officer)}
      title={officer.access ? o.revoke : o.restore}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors disabled:opacity-50",
        officer.access ? "bg-[#E4F1DA] text-[#245B3E] ring-[#245B3E]/15 hover:bg-[#FBEAE8] hover:text-[#8E3B34]" : "bg-[#FBEAE8] text-[#8E3B34] ring-[#8E3B34]/15 hover:bg-[#E4F1DA] hover:text-[#245B3E]"
      )}
    >
      {officer.access ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
      {busy ? "…" : (
        <>
          <span className="group-hover:hidden">{officer.access ? o.canSignIn : o.blocked}</span>
          <span className="hidden group-hover:inline">{officer.access ? o.revoke : o.restore}</span>
        </>
      )}
    </button>
  );

  const actions = (officer: OfficerRow, busy: boolean, protectedAccount: boolean, canDelete: boolean) => (
    <div className="flex justify-end gap-2">
      {protectedAccount ? (
        <Badge tone="blue">
          <ShieldCheck className="mr-1 h-3 w-3" />
          {o.protectedNote}
        </Badge>
      ) : (
        <button type="button" className={buttonClass("secondary", "sm")} disabled={busy} onClick={() => startEdit(officer)}>
          {t.common.edit}
        </button>
      )}
      {canDelete ? (
        <button type="button" className={buttonClass("danger", "sm")} disabled={busy} onClick={() => remove(officer)}>
          {t.common.delete}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title={o.title} description={o.subtitle} />

      <StatGrid>
        <StatCard icon={<Users />} label={o.statTotal} value={officers.length.toLocaleString("en-IN")} />
        <StatCard icon={<CheckCircle2 />} label={o.statAccess} value={withAccess.toLocaleString("en-IN")} />
        <StatCard icon={<Ban />} label={o.statBlocked} value={(officers.length - withAccess).toLocaleString("en-IN")} />
        <StatCard dark icon={<Leaf />} label={o.statFarmers} value={farmersTotal.toLocaleString("en-IN")} />
      </StatGrid>

      <form
        className={cn("rounded-2xl border bg-white p-5 shadow-sm", editing ? "border-[#3E5E2F] ring-2 ring-[#C6E26A]/50" : "border-[#1E3317]/10")}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-[#1E3317]">
          <UserPlus className="h-4 w-4 text-[#3E5E2F]" />
          {editing ? fmt(o.editTitle, { name: editing.name }) : o.addTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div>
            <label htmlFor="officer-name" className={labelClass}>
              {o.name}
            </label>
            <input id="officer-name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label htmlFor="officer-mobile" className={labelClass}>
              {o.mobile}
            </label>
            <input id="officer-mobile" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={o.mobilePh} inputMode="numeric" required className={inputClass} />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending ? t.common.saving : editing ? o.save : o.add}
            </button>
            {editing ? (
              <button type="button" disabled={pending} onClick={resetForm} className={buttonClass("secondary")}>
                {t.common.cancel}
              </button>
            ) : null}
          </div>
        </div>
        {error ? (
          <div className="mt-3">
            <Notice tone="red">{error}</Notice>
          </div>
        ) : null}
      </form>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={access === tab.key}
              onClick={() => {
                setAccess(tab.key);
                setPage(1);
              }}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                access === tab.key ? "bg-[#1E3317] text-white" : "border border-[#1E3317]/10 bg-white text-[#3E5E2F] hover:border-[#1E3317]/25"
              )}
            >
              {tab.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", access === tab.key ? "bg-[#C6E26A] text-[#1E3317]" : "bg-[#EDF2E7]")}>{tab.count}</span>
            </button>
          ))}
        </div>
        <SearchBox
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder={o.searchPh}
          label={o.searchPh}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm">
        {rows.length === 0 ? (
          <EmptyState icon={<Users />} title={query.trim() ? o.emptyMatch : o.empty} body={query.trim() ? o.emptyMatchBody : o.emptyBody} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>{o.colName}</th>
                    <th className={thClass}>{o.colRole}</th>
                    <th className={thClass}>{o.colFarmers}</th>
                    <th className={thClass}>{o.colAdded}</th>
                    <th className={thClass}>{o.colAccess}</th>
                    <th className={cn(thClass, "text-right")}>{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((officer) => {
                    const busy = pending && busyId === officer.id;
                    const mobile = mobileOf(officer.phone);
                    const protectedAccount = mobile === "9999999999";
                    const canDelete = officer.role === "sales_officer" && !protectedAccount;
                    return (
                      <tr key={officer.id} className={cn(trClass, editing?.id === officer.id && "bg-[#F4F8EF]")}>
                        <td className={tdClass}>
                          <p className="font-semibold text-[#1E3317]">{officer.name}</p>
                          <p className="text-xs tabular-nums text-[#5E6B62]">{mobile || "—"}</p>
                        </td>
                        <td className={tdClass}>
                          <Badge tone="grey">{role(officer.role)}</Badge>
                        </td>
                        <td className={cn(tdClass, "tabular-nums")}>{Number(officer.farmers) || 0}</td>
                        <td className={cn(tdClass, "text-[#5E6B62]")}>
                          {officer.createdAt ? new Date(officer.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className={tdClass}>{accessButton(officer, busy)}</td>
                        <td className={tdClass}>{actions(officer, busy, protectedAccount, canDelete)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="lg:hidden">
              {rows.map((officer) => {
                const busy = pending && busyId === officer.id;
                const mobile = mobileOf(officer.phone);
                const protectedAccount = mobile === "9999999999";
                const canDelete = officer.role === "sales_officer" && !protectedAccount;
                return (
                  <MobileCard key={officer.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#1E3317]">{officer.name}</p>
                        <p className="text-xs text-[#5E6B62]">
                          {mobile || "—"} · {role(officer.role)} · {fmt(o.farmersN, { n: Number(officer.farmers) || 0 })}
                        </p>
                      </div>
                      {accessButton(officer, busy)}
                    </div>
                    <div className="mt-3">{actions(officer, busy, protectedAccount, canDelete)}</div>
                  </MobileCard>
                );
              })}
            </div>
          </>
        )}

        {filtered.length > PAGE_SIZE ? (
          <div className="flex flex-col gap-3 border-t border-[#1E3317]/8 bg-[#FAFBF7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs tabular-nums text-[#5E6B62]">
              {fmt(t.common.showing, { from: from.toLocaleString("en-IN"), to: to.toLocaleString("en-IN"), total: filtered.length.toLocaleString("en-IN") })}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className={buttonClass("secondary", "sm")} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                {t.common.previous}
              </button>
              {numbers[0] > 1 ? <span className="px-1 text-xs text-[#5E6B62]">…</span> : null}
              {numbers.map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setPage(number)}
                  aria-current={number === currentPage ? "page" : undefined}
                  className={cn(
                    "h-9 min-w-9 rounded-xl px-2 text-xs font-semibold",
                    number === currentPage ? "bg-[#1E3317] text-white" : "text-[#1E3317] hover:bg-[#EDF2E7]"
                  )}
                >
                  {number}
                </button>
              ))}
              {numbers[numbers.length - 1] < pages ? <span className="px-1 text-xs text-[#5E6B62]">…</span> : null}
              <button type="button" className={buttonClass("secondary", "sm")} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>
                {t.common.next}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
