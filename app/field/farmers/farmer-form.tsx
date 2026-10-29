"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fieldFarmersList, saveFieldFarmer } from "@/lib/actions/field";
import { farmerFieldErrors, type FarmerFieldErrors } from "@/lib/field-farmer-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

const PAYMENT_MODES: Array<{ id: PaymentMode; label: string }> = [
  { id: "upi", label: "UPI" },
  { id: "cash", label: "Cash" },
  { id: "credit", label: "Credit" },
  { id: "card", label: "Card" },
  { id: "cheque", label: "Cheque" },
  { id: "neft", label: "Bank transfer (NEFT)" },
];

const fieldClass = "mt-1 h-9 rounded-md border-[#1E3317]/15 text-sm focus-visible:ring-[#1E3317]";
const primaryButton = "bg-[#1E3317] text-white hover:bg-[#245B3E]";

function countLabel(total: number, query: string) {
  const noun = total === 1 ? "farmer" : "farmers";
  const amount = total.toLocaleString("en-IN");
  return query ? `${amount} ${noun} match` : `${amount} ${noun}`;
}

function showPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length === 10) return `${ten.slice(0, 5)} ${ten.slice(5)}`;
  return phone.trim() || "—";
}

function cropSummary(farmer: FarmerRecord) {
  if (!farmer.farms.length) return "—";
  return farmer.farms.map((farm) => `${farm.crop || "—"} · ${farm.acres} ac`).join(", ");
}

function paymentLabel(mode: string) {
  return PAYMENT_MODES.find((item) => item.id === mode)?.label ?? mode;
}

export function FarmersWorkspace({ initial, officers }: { initial: ListResult; officers: Officer[] }) {
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

  const load = useCallback(async (nextQuery: string, nextPage: number) => {
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
      setError(err instanceof Error ? err.message : "Could not load farmers");
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void load(query, 1);
    }, 300);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#1E3317]">Farmers</h1>
          <p className="mt-1 text-sm text-[#5E6B62]">Manage farmer profiles, locations and field activity.</p>
          <p className="mt-1 text-sm tabular-nums text-[#29332C]">{countLabel(total, query.trim())}</p>
        </div>
        <Button type="button" onClick={() => setEditor("new")} className={`h-9 ${primaryButton}`}>
          Add farmer
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <label className="sr-only" htmlFor="farmer-search">
            Search farmers
          </label>
          <input
            id="farmer-search"
            role="searchbox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder="Search name, phone, village, territory, officer, or crop"
            className="h-9 w-full rounded-md border border-[#1E3317]/15 bg-white px-3 pr-16 text-sm text-[#29332C] outline-none focus:ring-2 focus:ring-[#1E3317]"
          />
          <span className="absolute inset-y-0 right-1 flex items-center gap-1">
            {loading ? (
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1E3317]/20 border-t-[#C6E26A]"
                role="status"
                aria-label="Searching"
              />
            ) : null}
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#5E6B62] hover:bg-[#F4F3EE]"
              >
                ×
              </button>
            ) : null}
          </span>
        </div>
        <p className="text-xs tabular-nums text-[#5E6B62]">
          {total === 0 ? "0 shown" : `${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`}
        </p>
      </div>

      {notice ? (
        <p role="status" className="text-sm text-[#245B3E]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-[#8E3B34]/30 bg-white px-3 py-2">
          <p className="text-sm text-[#8E3B34]">{error}</p>
          <button type="button" onClick={() => void load(query, page)} className="text-sm font-medium text-[#245B3E] hover:underline">
            Retry
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-[#1E3317]/10 bg-white" aria-busy={loading}>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-[#1E3317]">{query.trim() ? "No farmers match" : "No farmers yet"}</p>
            <p className="mt-1 text-sm text-[#5E6B62]">
              {query.trim() ? "Try another name, village, phone, officer, or crop." : "Add a farmer to start a field profile."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-[#1E3317]/10 text-left text-xs text-[#5E6B62]">
                <tr>
                  <th className="px-3 py-2 font-medium">Farmer</th>
                  <th className="px-3 py-2 font-medium">Village</th>
                  <th className="px-3 py-2 font-medium">Territory</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Officer</th>
                  <th className="px-3 py-2 font-medium">Crops · acres</th>
                  <th className="px-3 py-2 font-medium">Payment</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((farmer) => (
                  <tr key={farmer.id} className="border-t border-[#1E3317]/10 hover:bg-[#F7F6F1]">
                    <td className="max-w-[16rem] px-3 py-2.5">
                      <Link href={`/field/farmers/${farmer.id}`} className="font-medium break-words text-[#1E3317] hover:underline">
                        {farmer.name}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] px-3 py-2.5 break-words text-[#29332C]">{farmer.village || "—"}</td>
                    <td className="px-3 py-2.5 text-[#29332C]">{farmer.territory || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[#29332C]">{showPhone(farmer.phone)}</td>
                    <td className="max-w-[12rem] px-3 py-2.5 break-words text-[#29332C]">{farmer.assignedOfficer || "—"}</td>
                    <td className="max-w-[18rem] px-3 py-2.5 break-words text-[#5E6B62]">{cropSummary(farmer)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{paymentLabel(farmer.paymentMode)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setNotice("");
                          setEditor(farmer);
                        }}
                        className="text-xs font-medium text-[#245B3E] hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void load(query, page - 1)}>
            Previous
          </Button>
          <span className="text-[#5E6B62]">
            Page {page.toLocaleString("en-IN")} of {pages.toLocaleString("en-IN")}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => void load(query, page + 1)}>
            Next
          </Button>
        </div>
      ) : null}

      {editor !== false ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-[#1E3317]/40" onClick={requestClose} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="farmer-editor-title"
            className="relative flex h-full w-full max-w-2xl flex-col bg-[#F4F3EE] shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#1E3317]/10 bg-white px-4 py-3">
              <div>
                <h2 id="farmer-editor-title" className="text-base font-semibold text-[#1E3317]">
                  {editor === "new" ? "Add farmer" : `Edit ${editor.name}`}
                </h2>
                <p className="mt-0.5 text-xs text-[#5E6B62]">
                  {editor === "new"
                    ? "Name and phone are required. The farmer signs in with this phone."
                    : "The login phone stays the same. Other profile details update the Field app."}
                </p>
              </div>
              <button type="button" aria-label="Close editor" onClick={requestClose} className="text-xl leading-none text-[#5E6B62]">
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {discard ? (
                <div role="alert" className="mb-3 rounded-md border border-[#1E3317]/15 bg-white px-3 py-3">
                  <p className="text-sm text-[#1E3317]">Discard unsaved changes?</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="destructive" size="sm" onClick={closeEditor}>
                      Discard
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setDiscard(false)}>
                      Keep editing
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="rounded-lg border border-[#1E3317]/10 bg-white p-4">
                <FarmerEditor
                  key={editor === "new" ? "new" : editor.id}
                  farmer={editor === "new" ? undefined : editor}
                  officers={officers}
                  onDirty={setDirty}
                  onCancel={requestClose}
                  onSaved={(row) => {
                    setNotice(`Saved ${row.name}`);
                    closeEditor();
                    void load(query, editor === "new" ? 1 : page);
                  }}
                />
              </div>
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
        if (!row) throw new Error("Farmer was not saved");
        setBaseline(snapshot);
        setSaved(true);
        if (onSaved) onSaved(row as FarmerRecord);
        else router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not save farmer");
      })
      .finally(() => setPending(false));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {farmer ? <p className="text-xs text-[#5E6B62]">Farmer ID {farmer.id}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id={`${formId}-name`}
          label="Name"
          required
          value={name}
          error={errors.name}
          onChange={setName}
        />
        <div>
          <Label htmlFor={`${formId}-phone`}>
            Phone {farmer ? null : <span className="text-[#8E3B34]">*</span>}
          </Label>
          <Input
            id={`${formId}-phone`}
            value={farmer ? showPhone(farmer.phone) : phone}
            onChange={(event) => setPhone(event.target.value)}
            readOnly={Boolean(farmer)}
            inputMode="tel"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={`${formId}-phone-help`}
            className={`${fieldClass} ${farmer ? "bg-[#F4F3EE] text-[#5E6B62]" : ""}`}
          />
          <p id={`${formId}-phone-help`} className="mt-1 text-xs text-[#5E6B62]">
            {farmer
              ? "Login phone. It stays with this account."
              : "The farmer signs in to the Field app with this number."}
          </p>
          {errors.phone ? <p className="mt-1 text-xs text-[#8E3B34]">{errors.phone}</p> : null}
        </div>
        <TextField id={`${formId}-alt`} label="Alternate phone" value={altPhone} error={errors.altPhone} onChange={setAltPhone} />
        <TextField id={`${formId}-village`} label="Village" value={village} onChange={setVillage} />
        <TextField id={`${formId}-territory`} label="Territory" value={territory} onChange={setTerritory} help="Taluk or beat area stored on the farmer." />
        <TextField id={`${formId}-pin`} label="PIN" value={pin} error={errors.pin} onChange={setPin} inputMode="numeric" />
        <div className="sm:col-span-2">
          <TextField id={`${formId}-address`} label="Address" value={address} onChange={setAddress} />
        </div>
        <div>
          <Label htmlFor={`${formId}-language`}>Notification language</Label>
          <select
            id={`${formId}-language`}
            className={`${fieldClass} w-full bg-white px-3`}
            value={language}
            onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "ta")}
          >
            <option value="ta">Tamil</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`${formId}-officer`}>Field officer</Label>
          <select
            id={`${formId}-officer`}
            className={`${fieldClass} w-full bg-white px-3`}
            value={officerId}
            onChange={(event) => setOfficerId(event.target.value)}
          >
            <option value="">Unassigned</option>
            {officers.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name} · {showPhone(officer.phone)}
              </option>
            ))}
          </select>
          {farmer && !farmer.assignedOfficerId && farmer.fieldOfficerName ? (
            <p className="mt-1 text-xs text-[#5E6B62]">Recorded name: {farmer.fieldOfficerName}</p>
          ) : (
            <p className="mt-1 text-xs text-[#5E6B62]">The name shown for this farmer in the Field app.</p>
          )}
        </div>
        <div>
          <Label htmlFor={`${formId}-pay`}>Payment method</Label>
          <select
            id={`${formId}-pay`}
            className={`${fieldClass} w-full bg-white px-3`}
            value={paymentMode}
            onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}
          >
            {PAYMENT_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
          {errors.payment ? <p className="mt-1 text-xs text-[#8E3B34]">{errors.payment}</p> : null}
        </div>
        <TextField id={`${formId}-points`} label="Reward points" value={points} error={errors.points} onChange={setPoints} inputMode="numeric" />
        <div className="sm:col-span-2">
          <TextField id={`${formId}-photo`} label="Photo URL" value={photo} onChange={setPhoto} help="Optional. Leave blank to keep no photo." />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#1E3317]">Farms</h3>
          <button type="button" onClick={() => setFarmRows((rows) => [...rows, blankFarm()])} className="text-xs font-medium text-[#245B3E] hover:underline">
            Add farm
          </button>
        </div>
        {farmRows.length === 0 ? <p className="text-xs text-[#5E6B62]">No farms recorded. Crops and acreage are added per farm.</p> : null}
        {errors.acres ? <p className="text-xs text-[#8E3B34]">{errors.acres}</p> : null}
        {farmRows.map((farm, index) => (
          <div key={farm.id ?? `new-${index}`} className="grid gap-2 rounded-md border border-[#1E3317]/10 p-3 sm:grid-cols-3">
            <FarmInput label="Farm" value={farm.name} onChange={(value) => patchFarm(index, { name: value })} />
            <FarmInput label="Crop" value={farm.crop} onChange={(value) => patchFarm(index, { crop: value })} />
            <FarmInput label="Acres" value={farm.acres} onChange={(value) => patchFarm(index, { acres: value })} />
            <FarmInput label="GPS" value={farm.gps} onChange={(value) => patchFarm(index, { gps: value })} />
            <FarmInput label="Address" value={farm.address} onChange={(value) => patchFarm(index, { address: value })} />
            <FarmInput label="PIN" value={farm.pin} onChange={(value) => patchFarm(index, { pin: value })} />
            <button
              type="button"
              onClick={() => setFarmRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
              className="text-left text-xs font-medium text-[#8E3B34] hover:underline"
            >
              Remove farm
            </button>
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[#8E3B34]">
          {error} Your edits are still here.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className={saved && !dirty ? "bg-[#245B3E] hover:bg-[#245B3E]" : primaryButton}>
          {pending ? "Saving…" : saved && !dirty ? "Saved" : farmer ? "Save farmer" : "Add farmer"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => (onCancel ? onCancel() : router.push("/field/farmers"))}>
          Cancel
        </Button>
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
      <Label htmlFor={id}>
        {label} {required ? <span className="text-[#8E3B34]">*</span> : null}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? `${id}-note` : undefined}
        className={fieldClass}
      />
      {error ? (
        <p id={`${id}-note`} className="mt-1 text-xs text-[#8E3B34]">
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
      <Label htmlFor={id} className="text-xs text-[#5E6B62]">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </div>
  );
}
