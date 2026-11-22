"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Leaf, MapPin, Phone, Plus, Trash2, UserPlus, X } from "lucide-react";
import { fieldFarmersList, saveFieldFarmer } from "@/lib/actions/field";
import { farmerFieldErrors, type FarmerFieldErrors } from "@/lib/field-farmer-rules";
import {
  Badge,
  EmptyState,
  MobileCard,
  Notice,
  PageHeader,
  SearchBox,
  buttonClass,
  inputClass,
  labelClass,
  tableClass,
  tdClass,
  thClass,
  theadClass,
  trClass,
} from "@/components/field/kit";
import { useFieldText } from "@/components/field/lang";
import { fmt, type FieldText } from "@/lib/field-i18n";
import { cn } from "@/lib/utils";

type Officer = { id: number; name: string; phone: string };
type PaymentMode = "upi" | "cash" | "credit" | "card" | "cheque" | "neft";

export type FarmerRecord = {
  id: number;
  name: string;
  village: string;
  address: string;
  pin: string;
  territory: string;
  phone: string;
  altPhone: string;
  language: "en" | "ta";
  rewardPoints: number;
  assignedOfficerId: number | null;
  fieldOfficerName: string;
  assignedOfficer: string;
  photo?: string;
  paymentMode: PaymentMode;
  farms: Array<{
    dbId: number;
    name: string;
    crop: string;
    acres: number;
    gps: string;
    address: string;
    pin: string;
    validated: boolean;
  }>;
};

type ListResult = {
  farmers: FarmerRecord[];
  total: number;
  page: number;
  pageSize: number;
};

const PAYMENT_MODES: PaymentMode[] = ["upi", "cash", "credit", "card", "cheque", "neft"];

function payLabel(f: FieldText["farmers"], mode: string) {
  return (f as Record<string, string>)[`pay_${mode}`] ?? mode;
}

function showPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length === 10) return `${ten.slice(0, 5)} ${ten.slice(5)}`;
  return phone.trim() || "—";
}

/** Validation messages come from shared rules in English; show them in the admin's language. */
function localError(f: FieldText["farmers"], message?: string) {
  if (!message) return message;
  const map: Record<string, string> = {
    "Name is required.": f.err_name,
    "Enter a 10-digit phone number.": f.err_phone,
    "PIN must be 6 digits.": f.err_pin,
    "Alternate phone must be 10 digits.": f.err_alt,
    "Reward points must be zero or more.": f.err_points,
    "Choose a payment method.": f.err_payment,
    "Acreage must be zero or more.": f.err_acres,
  };
  return map[message] ?? message;
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "•"
  );
}

export function FarmersWorkspace({ initial, officers }: { initial: ListResult; officers: Officer[] }) {
  const t = useFieldText();
  const f = t.farmers;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initial.page);
  const [rows, setRows] = useState(initial.farmers);
  const [total, setTotal] = useState(initial.total);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<FarmerRecord | "new" | false>(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const request = useRef(0);
  const firstQuery = useRef(true);

  const load = useCallback(
    async (nextQuery: string, nextPage: number) => {
      const token = ++request.current;
      setLoading(true);
      setError("");
      try {
        const result = await fieldFarmersList({ q: nextQuery.trim(), page: nextPage });
        if (token !== request.current) return;
        setRows(result.farmers as FarmerRecord[]);
        setTotal(result.total);
        setPage(result.page);
        setPageSize(result.pageSize);
      } catch (err) {
        if (token !== request.current) return;
        setError(err instanceof Error ? err.message : f.loadFailed);
      } finally {
        if (token === request.current) setLoading(false);
      }
    },
    [f.loadFailed]
  );

  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    const timer = window.setTimeout(() => void load(query, 1), 300);
    return () => window.clearTimeout(timer);
  }, [query, load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const open = editor !== false;

  function closeEditor() {
    setEditor(false);
    setDirty(false);
    setDiscard(false);
  }
  function requestClose() {
    if (dirty) setDiscard(true);
    else closeEditor();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (dirty) setDiscard(true);
        else closeEditor();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dirty]);

  const crops = (farmer: FarmerRecord) =>
    farmer.farms.length === 0 ? (
      <span className="text-xs text-[#5E6B62]">{f.noFarms}</span>
    ) : (
      <div className="flex flex-wrap gap-1">
        {farmer.farms.slice(0, 3).map((farm, i) => (
          <span key={i} className="rounded-full bg-[#EDF2E7] px-2 py-0.5 text-[11px] font-medium text-[#3E5E2F]">
            {farm.crop || "—"} · {fmt(f.acres, { n: farm.acres })}
          </span>
        ))}
        {farmer.farms.length > 3 ? <span className="text-[11px] text-[#5E6B62]">+{farmer.farms.length - 3}</span> : null}
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={f.title}
        description={f.subtitle}
        actions={
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setEditor("new");
            }}
            className={buttonClass("primary")}
          >
            <UserPlus aria-hidden /> {f.add}
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox value={query} onChange={setQuery} placeholder={f.searchPh} label={f.searchPh} className="sm:max-w-lg" />
        <div className="flex items-center gap-3 text-sm">
          <Badge tone="lime">{fmt(total === 1 ? f.countOne : query.trim() ? f.countMatch : f.count, { n: total.toLocaleString("en-IN") })}</Badge>
          {loading ? <span role="status" aria-label={t.common.loading} className="h-4 w-4 animate-spin rounded-full border-2 border-[#1E3317]/20 border-t-[#3E5E2F]" /> : null}
        </div>
      </div>

      {notice ? <Notice>{notice}</Notice> : null}
      {error ? (
        <div className="flex flex-wrap items-center gap-3">
          <Notice tone="red">{error}</Notice>
          <button type="button" onClick={() => void load(query, page)} className={buttonClass("secondary", "sm")}>
            {f.retry}
          </button>
        </div>
      ) : null}

      <div className={cn("overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm transition-opacity", loading && "opacity-60")} aria-busy={loading}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Leaf />}
            title={query.trim() ? f.emptyMatch : f.empty}
            body={query.trim() ? f.emptyMatchBody : f.emptyBody}
            action={
              query.trim() ? (
                <button type="button" onClick={() => setQuery("")} className={buttonClass("secondary")}>
                  {t.common.clearSearch}
                </button>
              ) : (
                <button type="button" onClick={() => setEditor("new")} className={buttonClass("primary")}>
                  <UserPlus aria-hidden /> {f.add}
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className={tableClass}>
                <thead className={theadClass}>
                  <tr>
                    <th className={thClass}>{f.colFarmer}</th>
                    <th className={thClass}>{f.colVillage}</th>
                    <th className={thClass}>{f.colOfficer}</th>
                    <th className={thClass}>{f.colCrops}</th>
                    <th className={thClass}>{f.colPayment}</th>
                    <th className={cn(thClass, "text-right")}>{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((farmer) => (
                    <tr key={farmer.id} className={trClass}>
                      <td className={tdClass}>
                        <Link href={`/field/farmers/${farmer.id}`} className="group flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EDF2E7] text-xs font-bold text-[#3E5E2F]">
                            {initials(farmer.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-[#1E3317] group-hover:underline">{farmer.name}</span>
                            <span className="block text-xs tabular-nums text-[#5E6B62]">{showPhone(farmer.phone)}</span>
                          </span>
                        </Link>
                      </td>
                      <td className={tdClass}>
                        <p className="text-[#1E3317]">{farmer.village || "—"}</p>
                        {farmer.territory ? <p className="text-xs text-[#5E6B62]">{farmer.territory}</p> : null}
                      </td>
                      <td className={tdClass}>{farmer.assignedOfficer ? <span className="text-[#1E3317]">{farmer.assignedOfficer}</span> : <Badge tone="amber">{f.unassigned}</Badge>}</td>
                      <td className={cn(tdClass, "max-w-[18rem]")}>{crops(farmer)}</td>
                      <td className={tdClass}>
                        <Badge tone="grey">{payLabel(f, farmer.paymentMode)}</Badge>
                      </td>
                      <td className={cn(tdClass, "text-right")}>
                        <button
                          type="button"
                          onClick={() => {
                            setNotice("");
                            setEditor(farmer);
                          }}
                          className={buttonClass("secondary", "sm")}
                        >
                          {t.common.edit}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lg:hidden">
              {rows.map((farmer) => (
                <MobileCard key={farmer.id}>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EDF2E7] text-xs font-bold text-[#3E5E2F]">
                      {initials(farmer.name)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Link href={`/field/farmers/${farmer.id}`} className="block font-semibold text-[#1E3317] hover:underline">
                        {farmer.name}
                      </Link>
                      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#5E6B62]">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {showPhone(farmer.phone)}
                        </span>
                        {farmer.village ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {farmer.village}
                          </span>
                        ) : null}
                        <span>{farmer.assignedOfficer || f.unassigned}</span>
                      </p>
                      {crops(farmer)}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNotice("");
                        setEditor(farmer);
                      }}
                      className={buttonClass("secondary", "sm")}
                    >
                      {t.common.edit}
                    </button>
                  </div>
                </MobileCard>
              ))}
            </div>
          </>
        )}
        {pages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1E3317]/8 bg-[#FAFBF7] px-4 py-3 text-xs text-[#5E6B62]">
            <span className="tabular-nums">
              {fmt(t.common.showing, { from: from.toLocaleString("en-IN"), to: to.toLocaleString("en-IN"), total: total.toLocaleString("en-IN") })}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || loading} onClick={() => void load(query, page - 1)} className={buttonClass("secondary", "sm")}>
                {t.common.previous}
              </button>
              <button type="button" disabled={page >= pages || loading} onClick={() => void load(query, page + 1)} className={buttonClass("secondary", "sm")}>
                {t.common.next}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {editor !== false ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label={t.common.close} className="absolute inset-0 bg-[#0F1A0C]/50" onClick={requestClose} />
          <div role="dialog" aria-modal="true" aria-labelledby="farmer-editor-title" className="relative flex h-full w-full max-w-2xl flex-col bg-[#F4F3EE] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#1E3317]/10 bg-white px-5 py-4">
              <div>
                <h2 id="farmer-editor-title" className="text-lg font-bold text-[#1E3317]">
                  {editor === "new" ? f.add : fmt(f.editTitle, { name: editor.name })}
                </h2>
                <p className="mt-0.5 text-xs text-[#5E6B62]">{editor === "new" ? f.newHelp : f.editHelp}</p>
              </div>
              <button type="button" aria-label={t.common.close} onClick={requestClose} className="flex h-9 w-9 items-center justify-center rounded-full text-[#5E6B62] hover:bg-[#EDF2E7]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {discard ? (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#8A5A00]/20 bg-[#FFF8EB] px-4 py-3">
                  <p className="text-sm font-medium text-[#1E3317]">{f.discardQ}</p>
                  <div className="flex gap-2">
                    <button type="button" className={buttonClass("danger", "sm")} onClick={closeEditor}>
                      {f.discard}
                    </button>
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setDiscard(false)}>
                      {f.keepEditing}
                    </button>
                  </div>
                </div>
              ) : null}
              <FarmerEditor
                key={editor === "new" ? "new" : editor.id}
                farmer={editor === "new" ? undefined : editor}
                officers={officers}
                onDirty={setDirty}
                onCancel={requestClose}
                onSaved={(row) => {
                  setNotice(fmt(f.savedNotice, { name: row.name }));
                  closeEditor();
                  void load(query, editor === "new" ? 1 : page);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type FarmDraft = {
  id?: number;
  name: string;
  crop: string;
  acres: string;
  gps: string;
  address: string;
  pin: string;
  validated: boolean;
};

function blankFarm(): FarmDraft {
  return { name: "", crop: "", acres: "", gps: "", address: "", pin: "", validated: false };
}

function farmsFrom(farmer?: FarmerRecord): FarmDraft[] {
  return (
    farmer?.farms.map((farm) => ({
      id: farm.dbId,
      name: farm.name,
      crop: farm.crop,
      acres: String(farm.acres),
      gps: farm.gps,
      address: farm.address,
      pin: farm.pin,
      validated: farm.validated,
    })) ?? []
  );
}

function formSnapshot(input: {
  name: string;
  village: string;
  territory: string;
  address: string;
  pin: string;
  phone: string;
  altPhone: string;
  language: "en" | "ta";
  officerId: string;
  points: string;
  paymentMode: PaymentMode;
  photo: string;
  farmRows: FarmDraft[];
}) {
  return JSON.stringify(input);
}

export function FarmerEditor({
  farmer,
  officers,
  onSaved,
  onCancel,
  onDirty,
}: {
  farmer?: FarmerRecord;
  officers: Officer[];
  onSaved?: (farmer: FarmerRecord) => void;
  onCancel?: () => void;
  onDirty?: (dirty: boolean) => void;
}) {
  const t = useFieldText();
  const f = t.farmers;
  const router = useRouter();
  const formId = useId();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<FarmerFieldErrors>({});
  const [name, setName] = useState(farmer?.name ?? "");
  const [village, setVillage] = useState(farmer?.village ?? "");
  const [territory, setTerritory] = useState(farmer?.territory ?? "");
  const [address, setAddress] = useState(farmer?.address ?? "");
  const [pin, setPin] = useState(farmer?.pin ?? "");
  const [phone, setPhone] = useState(farmer?.phone ?? "");
  const [altPhone, setAltPhone] = useState(farmer?.altPhone ?? "");
  const [language, setLanguage] = useState<"en" | "ta">(farmer?.language ?? "ta");
  const [officerId, setOfficerId] = useState(farmer?.assignedOfficerId ? String(farmer.assignedOfficerId) : "");
  const [points, setPoints] = useState(String(farmer?.rewardPoints ?? 0));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(farmer?.paymentMode ?? "upi");
  const [photo, setPhoto] = useState(farmer?.photo ?? "");
  const [farmRows, setFarmRows] = useState<FarmDraft[]>(() => farmsFrom(farmer));
  const [baseline, setBaseline] = useState(() =>
    formSnapshot({
      name: farmer?.name ?? "",
      village: farmer?.village ?? "",
      territory: farmer?.territory ?? "",
      address: farmer?.address ?? "",
      pin: farmer?.pin ?? "",
      phone: farmer?.phone ?? "",
      altPhone: farmer?.altPhone ?? "",
      language: farmer?.language ?? "ta",
      officerId: farmer?.assignedOfficerId ? String(farmer.assignedOfficerId) : "",
      points: String(farmer?.rewardPoints ?? 0),
      paymentMode: farmer?.paymentMode ?? "upi",
      photo: farmer?.photo ?? "",
      farmRows: farmsFrom(farmer),
    })
  );
  const snapshot = formSnapshot({ name, village, territory, address, pin, phone, altPhone, language, officerId, points, paymentMode, photo, farmRows });
  const dirty = snapshot !== baseline;

  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);

  function submit() {
    const rewardPoints = Number(points);
    const nextErrors = farmerFieldErrors({
      name,
      phone,
      pinCode: pin,
      altPhone,
      rewardPoints,
      paymentMode,
      requirePhone: !farmer,
      farms: farmRows
        .filter((farm) => farm.name || farm.crop || farm.acres || farm.gps || farm.address || farm.pin)
        .map((farm) => ({ acres: farm.acres.trim() === "" ? 0 : Number(farm.acres) })),
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const selected = officers.find((officer) => String(officer.id) === officerId);
    const farms = farmRows
      .filter((farm) => farm.name.trim() || farm.crop.trim() || farm.acres.trim() || farm.gps.trim() || farm.address.trim() || farm.pin.trim())
      .map((farm) => ({
        id: farm.id,
        name: farm.name.trim() || "Main field",
        crop: farm.crop.trim(),
        acres: farm.acres.trim() === "" ? 0 : Number(farm.acres),
        gps: farm.gps.trim(),
        address: farm.address.trim(),
        pin: farm.pin.trim(),
        validated: farm.validated,
      }));
    setPending(true);
    setError("");
    setSaved(false);
    void saveFieldFarmer(
      {
        name: name.trim(),
        village,
        territory,
        address,
        pinCode: pin,
        phone: farmer ? farmer.phone : phone,
        altPhone,
        language,
        assignedOfficerId: officerId ? Number(officerId) : null,
        fieldOfficerName: selected?.name ?? "",
        paymentMode,
        rewardPoints,
        photoUrl: photo.trim() || null,
        source: farmer ? undefined : "registered",
        farms,
      },
      farmer?.id
    )
      .then((row) => {
        if (!row) throw new Error(f.notSaved);
        setBaseline(snapshot);
        setSaved(true);
        if (onSaved) onSaved(row as FarmerRecord);
        else router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : f.saveFailed);
      })
      .finally(() => setPending(false));
  }

  const card = "space-y-4 rounded-2xl border border-[#1E3317]/10 bg-white p-4 shadow-sm sm:p-5";
  const h3 = "text-sm font-bold text-[#1E3317]";
  const err = (m?: string) => localError(f, m);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <section className={card}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={h3}>{f.sectionProfile}</h3>
          {farmer ? <span className="text-xs text-[#5E6B62]">{fmt(f.farmerId, { id: farmer.id })}</span> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id={`${formId}-name`} label={f.name} required value={name} error={err(errors.name)} onChange={setName} />
          <div>
            <label htmlFor={`${formId}-phone`} className={labelClass}>
              {f.phone} {farmer ? null : <span className="text-[#8E3B34]">*</span>}
            </label>
            <input
              id={`${formId}-phone`}
              value={farmer ? showPhone(farmer.phone) : phone}
              onChange={(event) => setPhone(event.target.value)}
              readOnly={Boolean(farmer)}
              inputMode="tel"
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={`${formId}-phone-help`}
              className={cn(inputClass, farmer && "bg-[#F4F3EE] text-[#5E6B62]")}
            />
            <p id={`${formId}-phone-help`} className="mt-1 text-xs text-[#5E6B62]">
              {farmer ? f.phoneHelpEdit : f.phoneHelpNew}
            </p>
            {errors.phone ? <p className="mt-1 text-xs font-medium text-[#8E3B34]">{err(errors.phone)}</p> : null}
          </div>
          <div>
            <label htmlFor={`${formId}-language`} className={labelClass}>
              {f.language}
            </label>
            <select id={`${formId}-language`} className={inputClass} value={language} onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "ta")}>
              <option value="ta">{f.tamil}</option>
              <option value="en">{f.english}</option>
            </select>
          </div>
          <TextField id={`${formId}-photo`} label={f.photo} value={photo} onChange={setPhoto} help={f.photoHelp} />
        </div>
      </section>

      <section className={card}>
        <h3 className={h3}>{f.sectionContact}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id={`${formId}-alt`} label={f.altPhone} value={altPhone} error={err(errors.altPhone)} onChange={setAltPhone} inputMode="tel" />
          <TextField id={`${formId}-village`} label={f.village} value={village} onChange={setVillage} />
          <TextField id={`${formId}-territory`} label={f.territory} value={territory} onChange={setTerritory} help={f.territoryHelp} />
          <TextField id={`${formId}-pin`} label={f.pin} value={pin} error={err(errors.pin)} onChange={setPin} inputMode="numeric" />
          <div className="sm:col-span-2">
            <TextField id={`${formId}-address`} label={f.address} value={address} onChange={setAddress} />
          </div>
        </div>
      </section>

      <section className={card}>
        <h3 className={h3}>{f.sectionField}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${formId}-officer`} className={labelClass}>
              {f.officer}
            </label>
            <select id={`${formId}-officer`} className={inputClass} value={officerId} onChange={(event) => setOfficerId(event.target.value)}>
              <option value="">{f.unassigned}</option>
              {officers.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name} · {showPhone(officer.phone)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[#5E6B62]">
              {farmer && !farmer.assignedOfficerId && farmer.fieldOfficerName ? fmt(f.recordedName, { name: farmer.fieldOfficerName }) : f.officerHelp}
            </p>
          </div>
          <div>
            <label htmlFor={`${formId}-pay`} className={labelClass}>
              {f.payment}
            </label>
            <select id={`${formId}-pay`} className={inputClass} value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}>
              {PAYMENT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {payLabel(f, mode)}
                </option>
              ))}
            </select>
            {errors.payment ? <p className="mt-1 text-xs font-medium text-[#8E3B34]">{err(errors.payment)}</p> : null}
          </div>
          <TextField id={`${formId}-points`} label={f.points} value={points} error={err(errors.points)} onChange={setPoints} inputMode="numeric" />
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={h3}>{f.farms}</h3>
          <button type="button" onClick={() => setFarmRows((rows) => [...rows, blankFarm()])} className={buttonClass("secondary", "sm")}>
            <Plus aria-hidden /> {f.addFarm}
          </button>
        </div>
        {farmRows.length === 0 ? <p className="rounded-xl bg-[#FAFBF7] px-4 py-5 text-center text-sm text-[#5E6B62]">{f.noFarmsHelp}</p> : null}
        {errors.acres ? <p className="text-xs font-medium text-[#8E3B34]">{err(errors.acres)}</p> : null}
        {farmRows.map((farm, index) => (
          <div key={farm.id ?? `new-${index}`} className="grid gap-3 rounded-xl border border-[#1E3317]/10 bg-[#FAFBF7] p-4 sm:grid-cols-3">
            <FarmInput label={f.farm} value={farm.name} onChange={(value) => patchFarm(index, { name: value })} />
            <FarmInput label={f.crop} value={farm.crop} onChange={(value) => patchFarm(index, { crop: value })} />
            <FarmInput label={f.acresLabel} value={farm.acres} onChange={(value) => patchFarm(index, { acres: value })} />
            <FarmInput label={f.gps} value={farm.gps} onChange={(value) => patchFarm(index, { gps: value })} />
            <FarmInput label={f.address} value={farm.address} onChange={(value) => patchFarm(index, { address: value })} />
            <FarmInput label={f.pin} value={farm.pin} onChange={(value) => patchFarm(index, { pin: value })} />
            <div className="sm:col-span-3">
              <button type="button" onClick={() => setFarmRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className={buttonClass("danger", "sm")}>
                <Trash2 aria-hidden /> {f.removeFarm}
              </button>
            </div>
          </div>
        ))}
      </section>

      {error ? (
        <Notice tone="red">
          {error} {f.keptEdits}
        </Notice>
      ) : null}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-[#1E3317]/10 bg-[#F4F3EE]/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        <button type="button" disabled={pending} onClick={() => (onCancel ? onCancel() : router.push("/field/farmers"))} className={buttonClass("secondary")}>
          {t.common.cancel}
        </button>
        <button type="submit" disabled={pending} className={buttonClass(saved && !dirty ? "lime" : "primary")}>
          {pending ? t.common.saving : saved && !dirty ? t.common.saved : farmer ? f.saveFarmer : f.add}
        </button>
      </div>
    </form>
  );

  function patchFarm(index: number, patch: Partial<FarmDraft>) {
    setFarmRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  help,
  required,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  help?: string;
  required?: boolean;
  inputMode?: "numeric" | "tel" | "text";
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} {required ? <span className="text-[#8E3B34]">*</span> : null}
      </label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? `${id}-note` : undefined}
        className={inputClass}
      />
      {error ? (
        <p id={`${id}-note`} className="mt-1 text-xs font-medium text-[#8E3B34]">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-note`} className="mt-1 text-xs text-[#5E6B62]">
          {help}
        </p>
      ) : null}
    </div>
  );
}

function FarmInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </div>
  );
}

