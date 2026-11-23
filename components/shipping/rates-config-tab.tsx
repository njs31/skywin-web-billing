"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Dialog, buttonClass, inputClass, labelClass } from "@/components/shipping/ui";

export type RateItem = {
  id: number;
  slab: string;
  minWeightGrams: number;
  maxWeightGrams: number;
  zoneName: string;
  regions: string;
  transitDays: string;
  shippingFee: number;
  pincodes: string;
  districts: string;
  states: string;
  isActive: boolean;
};

type Band = { min: number; max: number; slab: string };
type ZoneFields = Pick<RateItem, "zoneName" | "regions" | "transitDays" | "pincodes" | "districts" | "states">;
type Zone = ZoneFields & { rules: RateItem[]; level: number };

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function grams(g: number) {
  if (g >= 1000) return `${Number((g / 1000).toFixed(2))} kg`;
  return `${g} g`;
}
function bandLabel(b: { min: number; max: number }) {
  return b.min <= 1 ? `Up to ${grams(b.max)}` : `${grams(b.min)} – ${grams(b.max)}`;
}
/** Matching order: PIN code, district, state or region, then everywhere else. */
function levelOf(z: ZoneFields) {
  if (list(z.pincodes).length) return 0;
  if (list(z.districts).length) return 1;
  if (list(z.states).length) return 2;
  return 3;
}
function whereText(z: ZoneFields) {
  const parts: string[] = [];
  const pins = list(z.pincodes);
  const districts = list(z.districts);
  const states = list(z.states);
  if (pins.length) parts.push(`${pins.length} PIN code${pins.length === 1 ? "" : "s"}`);
  if (districts.length) parts.push(`${districts.slice(0, 3).map(title).join(", ")}${districts.length > 3 ? ` +${districts.length - 3} districts` : ""}`);
  if (states.length) parts.push(states.map(title).join(", "));
  return parts.length ? parts.join(" · ") : "Everywhere else in India";
}

async function post(body: unknown) {
  const res = await fetch("/api/shipping/rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save. Try again.");
  return data as { rate?: { id: number } };
}

type Editing =
  | { kind: "cell"; zone: Zone; band: Band; rule: RateItem | null }
  | { kind: "zone"; zone: Zone | null }
  | { kind: "band" };

export function RatesConfigTab({ initialRates }: { initialRates: RateItem[] }) {
  const [rates, setRates] = useState(initialRates);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saved, setSaved] = useState("");

  const bands = useMemo<Band[]>(() => {
    const seen = new Map<string, Band>();
    for (const r of rates) {
      const key = `${r.minWeightGrams}-${r.maxWeightGrams}`;
      if (!seen.has(key)) seen.set(key, { min: r.minWeightGrams, max: r.maxWeightGrams, slab: r.slab });
    }
    return [...seen.values()].sort((a, b) => a.min - b.min || a.max - b.max);
  }, [rates]);

  const zones = useMemo<Zone[]>(() => {
    const byName = new Map<string, Zone>();
    for (const r of rates) {
      const z = byName.get(r.zoneName);
      if (z) z.rules.push(r);
      else
        byName.set(r.zoneName, {
          zoneName: r.zoneName,
          regions: r.regions,
          transitDays: r.transitDays,
          pincodes: r.pincodes,
          districts: r.districts,
          states: r.states,
          rules: [r],
          level: levelOf(r),
        });
    }
    return [...byName.values()].sort((a, b) => a.level - b.level || a.zoneName.localeCompare(b.zoneName));
  }, [rates]);

  const heaviest = bands.at(-1);
  const done = (text: string) => {
    setEditing(null);
    setSaved(text);
    setTimeout(() => setSaved(""), 4000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Prices by zone and weight</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            Used when the delivery method is <span className="font-medium text-slate-700">Delivery</span>. The price is for the whole order&apos;s
            weight. Changes apply to the next checkout.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={buttonClass("secondary")} onClick={() => setEditing({ kind: "band" })} disabled={zones.length === 0}>
            <Plus className="h-4 w-4" aria-hidden /> Weight band
          </button>
          <button type="button" className={buttonClass("primary")} onClick={() => setEditing({ kind: "zone", zone: null })}>
            <Plus className="h-4 w-4" aria-hidden /> Zone
          </button>
        </div>
      </div>

      {saved ? (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {saved}
        </p>
      ) : null}

      {zones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">No rates yet</p>
          <p className="mt-1 text-sm text-slate-500">Add a zone to start charging delivery from your own rate card.</p>
        </div>
      ) : (
        <>
          {/* Desktop and tablet: zones down, weight bands across */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Zone</th>
                  <th className="px-4 py-2.5 font-medium">Transit</th>
                  {bands.map((b) => (
                    <th key={`${b.min}-${b.max}`} className="px-4 py-2.5 text-right font-medium" title={b.slab}>
                      {bandLabel(b)}
                    </th>
                  ))}
                  <th className="w-16 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.zoneName} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{z.zoneName}</p>
                      <p className="mt-0.5 max-w-md text-xs text-slate-500">{whereText(z)}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{z.transitDays || "—"}</td>
                    {bands.map((b) => {
                      const rule = z.rules.find((r) => r.minWeightGrams === b.min && r.maxWeightGrams === b.max) ?? null;
                      return (
                        <td key={`${b.min}-${b.max}`} className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setEditing({ kind: "cell", zone: z, band: b, rule })}
                            className={cn(
                              "inline-flex h-8 min-w-20 items-center justify-end rounded-md px-2 tabular-nums transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40",
                              !rule && "text-slate-300 hover:text-slate-500",
                              rule && !rule.isActive && "text-slate-400 line-through",
                              rule?.isActive && "font-medium text-slate-900"
                            )}
                            aria-label={`${z.zoneName}, ${bandLabel(b)}: ${rule ? formatCurrency(rule.shippingFee) : "no price"}. Edit`}
                          >
                            {rule ? formatCurrency(rule.shippingFee) : "Add"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right">
                      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setEditing({ kind: "zone", zone: z })}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per zone */}
          <div className="space-y-3 md:hidden">
            {zones.map((z) => (
              <div key={z.zoneName} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{z.zoneName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {whereText(z)} · {z.transitDays}
                    </p>
                  </div>
                  <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setEditing({ kind: "zone", zone: z })}>
                    Edit
                  </button>
                </div>
                <ul className="divide-y divide-slate-100">
                  {bands.map((b) => {
                    const rule = z.rules.find((r) => r.minWeightGrams === b.min && r.maxWeightGrams === b.max) ?? null;
                    return (
                      <li key={`${b.min}-${b.max}`}>
                        <button
                          type="button"
                          onClick={() => setEditing({ kind: "cell", zone: z, band: b, rule })}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="text-slate-600">{bandLabel(b)}</span>
                          <span className={cn("tabular-nums", !rule && "text-slate-400", rule && !rule.isActive && "text-slate-400 line-through", rule?.isActive && "font-medium text-slate-900")}>
                            {rule ? formatCurrency(rule.shippingFee) : "Add"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      <ul className="space-y-1 text-[13px] text-slate-500">
        <li>The most specific zone wins: PIN code, then district, then state or region, then everywhere else.</li>
        {zones.some((z) => bands.some((b) => !z.rules.some((r) => r.isActive && r.minWeightGrams === b.min && r.maxWeightGrams === b.max))) ? (
          <li>Where a zone has no price for a weight, that order uses the next matching zone that has one.</li>
        ) : null}
        {heaviest ? (
          <li>
            Orders heavier than {grams(heaviest.max)} pay the {bandLabel(heaviest).toLowerCase()} price for every {grams(heaviest.max)} (for example, {grams(heaviest.max * 2.5)} pays it 3 times).
          </li>
        ) : null}
        <li>On the invoice, delivery carries the same GST rate as the products in the order.</li>
      </ul>

      {editing?.kind === "cell" ? (
        <CellDialog
          zone={editing.zone}
          band={editing.band}
          rule={editing.rule}
          onClose={() => setEditing(null)}
          onSaved={(next, removedId, text) => {
            setRates((prev) => {
              let out = removedId ? prev.filter((r) => r.id !== removedId) : prev;
              if (next) out = out.some((r) => r.id === next.id) ? out.map((r) => (r.id === next.id ? next : r)) : [...out, next];
              return out;
            });
            done(text);
          }}
        />
      ) : null}
      {editing?.kind === "zone" ? (
        <ZoneDialog
          zone={editing.zone}
          bands={bands}
          takenNames={zones.filter((z) => z !== editing.zone).map((z) => z.zoneName.toLowerCase())}
          onClose={() => setEditing(null)}
          onSaved={(updated, removedIds, text) => {
            setRates((prev) => {
              const out = prev.filter((r) => !removedIds.includes(r.id));
              for (const u of updated) {
                const at = out.findIndex((r) => r.id === u.id);
                if (at >= 0) out[at] = u;
                else out.push(u);
              }
              return out;
            });
            done(text);
          }}
        />
      ) : null}
      {editing?.kind === "band" ? (
        <BandDialog
          zones={zones}
          bands={bands}
          onClose={() => setEditing(null)}
          onSaved={(created, text) => {
            setRates((prev) => [...prev, ...created]);
            done(text);
          }}
        />
      ) : null}
    </div>
  );
}

function CellDialog({
  zone,
  band,
  rule,
  onClose,
  onSaved,
}: {
  zone: Zone;
  band: Band;
  rule: RateItem | null;
  onClose: () => void;
  onSaved: (next: RateItem | null, removedId: number | null, text: string) => void;
}) {
  const [fee, setFee] = useState(rule ? String(rule.shippingFee) : "");
  const [active, setActive] = useState(rule?.isActive ?? true);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const feeNum = Number(fee);
  const valid = fee.trim() !== "" && Number.isFinite(feeNum) && feeNum >= 0;

  const save = () =>
    start(async () => {
      setError("");
      try {
        if (rule) {
          const next = { ...rule, shippingFee: feeNum, isActive: active };
          await post({ action: "update", rate: next });
          onSaved(next, null, `${zone.zoneName}, ${bandLabel(band).toLowerCase()}: ${formatCurrency(feeNum)}${active ? "" : " (off)"}.`);
        } else {
          const draft: RateItem = {
            id: 0,
            slab: band.slab,
            minWeightGrams: band.min,
            maxWeightGrams: band.max,
            zoneName: zone.zoneName,
            regions: zone.regions,
            transitDays: zone.transitDays,
            shippingFee: feeNum,
            pincodes: zone.pincodes,
            districts: zone.districts,
            states: zone.states,
            isActive: true,
          };
          const data = await post({ action: "create", rate: draft });
          onSaved({ ...draft, id: data.rate?.id ?? Date.now() }, null, `Added ${formatCurrency(feeNum)} for ${zone.zoneName}, ${bandLabel(band).toLowerCase()}.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });

  const remove = () => {
    if (!rule || !window.confirm(`Remove the ${bandLabel(band).toLowerCase()} price for ${zone.zoneName}?`)) return;
    start(async () => {
      setError("");
      try {
        await post({ action: "delete", rateId: rule.id });
        onSaved(null, rule.id, `Removed the ${bandLabel(band).toLowerCase()} price for ${zone.zoneName}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove.");
      }
    });
  };

  return (
    <Dialog open onClose={onClose} title={`${zone.zoneName} · ${bandLabel(band)}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !pending) save();
        }}
      >
        <label className="block">
          <span className={labelClass}>Delivery price (₹, including GST)</span>
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} className={inputClass + " tabular-nums"} autoFocus />
        </label>
        {rule ? (
          <label className="flex items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-emerald-700" />
            Use this price at checkout
          </label>
        ) : null}
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="flex items-center justify-between gap-2 pt-1">
          {rule ? (
            <button type="button" className={buttonClass("ghost") + " text-rose-700 hover:bg-rose-50 hover:text-rose-800"} onClick={remove} disabled={pending}>
              Remove
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className={buttonClass("ghost")} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className={buttonClass("primary")} disabled={!valid || pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function ZoneDialog({
  zone,
  bands,
  takenNames,
  onClose,
  onSaved,
}: {
  zone: Zone | null;
  bands: Band[];
  takenNames: string[];
  onClose: () => void;
  onSaved: (updated: RateItem[], removedIds: number[], text: string) => void;
}) {
  const [f, setF] = useState<ZoneFields>(
    zone
      ? { zoneName: zone.zoneName, regions: zone.regions, transitDays: zone.transitDays, pincodes: zone.pincodes, districts: zone.districts, states: zone.states }
      : { zoneName: "", regions: "", transitDays: "3 - 5 Days", pincodes: "", districts: "", states: "" }
  );
  // New zone: a price for each existing weight band (or a first band if there are none).
  const startBands = bands.length ? bands : [{ min: 0, max: 500, slab: "0-500g" }];
  const [fees, setFees] = useState<string[]>(startBands.map(() => ""));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof ZoneFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const clean: ZoneFields = {
    ...f,
    zoneName: f.zoneName.trim(),
    pincodes: list(f.pincodes).join(","),
    districts: list(f.districts).map((d) => d.toLowerCase()).join(","),
    states: list(f.states).map((s) => s.toLowerCase()).join(","),
  };
  const feesOk = !!zone || fees.every((x) => x.trim() === "" || (Number.isFinite(Number(x)) && Number(x) >= 0));
  const nameTaken = takenNames.includes(clean.zoneName.toLowerCase());
  const valid = clean.zoneName.length > 1 && !nameTaken && feesOk && (!!zone || fees.some((x) => x.trim() !== ""));

  const save = () =>
    start(async () => {
      setError("");
      try {
        if (zone) {
          const updated = zone.rules.map((r) => ({ ...r, ...clean }));
          for (const r of updated) await post({ action: "update", rate: r });
          onSaved(updated, [], `Saved ${clean.zoneName}.`);
        } else {
          const created: RateItem[] = [];
          for (const [i, b] of startBands.entries()) {
            if (fees[i].trim() === "") continue;
            const draft: RateItem = { id: 0, slab: b.slab, minWeightGrams: b.min, maxWeightGrams: b.max, ...clean, shippingFee: Number(fees[i]), isActive: true };
            const data = await post({ action: "create", rate: draft });
            created.push({ ...draft, id: data.rate?.id ?? Date.now() + i });
          }
          onSaved(created, [], `Added ${clean.zoneName}.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });

  const removeZone = () => {
    if (!zone || !window.confirm(`Remove ${zone.zoneName} and all its prices? Orders to these places will use the next matching zone.`)) return;
    start(async () => {
      setError("");
      try {
        for (const r of zone.rules) await post({ action: "delete", rateId: r.id });
        onSaved([], zone.rules.map((r) => r.id), `Removed ${zone.zoneName}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove.");
      }
    });
  };

  return (
    <Dialog open onClose={onClose} title={zone ? `Edit ${zone.zoneName}` : "New zone"} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !pending) save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <label className="block">
            <span className={labelClass}>Zone name</span>
            <input value={f.zoneName} onChange={set("zoneName")} placeholder="e.g. Chennai & Suburbs" className={inputClass} autoFocus={!zone} />
            {nameTaken ? <span className="mt-1 block text-xs text-amber-700">Another zone already has this name.</span> : null}
          </label>
          <label className="block">
            <span className={labelClass}>Transit time</span>
            <input value={f.transitDays} onChange={set("transitDays")} placeholder="e.g. 1 - 3 Days" className={inputClass} />
          </label>
        </div>
        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3.5">
          <legend className="px-1 text-[13px] font-medium text-slate-700">Where it applies</legend>
          <p className="text-xs text-slate-500">Fill one or more. Leave all three empty to cover everywhere no other zone matches.</p>
          <label className="block">
            <span className={labelClass}>PIN codes</span>
            <textarea value={f.pincodes} onChange={set("pincodes")} rows={2} placeholder="600016, 600043, 600044" className={inputClass + " h-auto py-2 font-mono text-[13px]"} />
          </label>
          <label className="block">
            <span className={labelClass}>Districts</span>
            <input value={f.districts} onChange={set("districts")} placeholder="coimbatore, madurai, tuticorin" className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>States or regions</span>
            <input value={f.states} onChange={set("states")} placeholder="kerala, north-east, south india" className={inputClass} />
          </label>
        </fieldset>
        <label className="block">
          <span className={labelClass}>Description (optional)</span>
          <input value={f.regions} onChange={set("regions")} placeholder="e.g. Tamil Nadu: Coimbatore, Madurai, Tuticorin…" className={inputClass} />
        </label>

        {!zone ? (
          <div>
            <p className={labelClass}>Prices (₹, including GST)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {startBands.map((b, i) => (
                <label key={`${b.min}-${b.max}`} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-sm text-slate-600">{bandLabel(b)}</span>
                  <input
                    inputMode="decimal"
                    value={fees[i]}
                    onChange={(e) => setFees(fees.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="—"
                    className={inputClass + " tabular-nums"}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Prices are edited in the rate card: click a price.</p>
        )}

        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="flex items-center justify-between gap-2 pt-1">
          {zone ? (
            <button type="button" className={buttonClass("ghost") + " text-rose-700 hover:bg-rose-50 hover:text-rose-800"} onClick={removeZone} disabled={pending}>
              Remove zone
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className={buttonClass("ghost")} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className={buttonClass("primary")} disabled={!valid || pending}>
              {pending ? "Saving…" : zone ? "Save zone" : "Add zone"}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function BandDialog({
  zones,
  bands,
  onClose,
  onSaved,
}: {
  zones: Zone[];
  bands: Band[];
  onClose: () => void;
  onSaved: (created: RateItem[], text: string) => void;
}) {
  const top = bands.at(-1);
  const [min, setMin] = useState(String(top ? top.max + 1 : 0));
  const [max, setMax] = useState(String(top ? top.max * 2 : 500));
  const [fees, setFees] = useState<string[]>(zones.map(() => ""));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const lo = Math.round(Number(min));
  const hi = Math.round(Number(max));
  const overlaps = bands.some((b) => lo <= b.max && hi >= b.min);
  const valid =
    Number.isFinite(lo) && Number.isFinite(hi) && lo >= 0 && hi > lo && !overlaps &&
    fees.some((x) => x.trim() !== "") &&
    fees.every((x) => x.trim() === "" || (Number.isFinite(Number(x)) && Number(x) >= 0));

  const save = () =>
    start(async () => {
      setError("");
      try {
        const slab = `${grams(lo)}-${grams(hi)}`.replace(/\s/g, "");
        const created: RateItem[] = [];
        for (const [i, z] of zones.entries()) {
          if (fees[i].trim() === "") continue;
          const draft: RateItem = {
            id: 0,
            slab,
            minWeightGrams: lo,
            maxWeightGrams: hi,
            zoneName: z.zoneName,
            regions: z.regions,
            transitDays: z.transitDays,
            pincodes: z.pincodes,
            districts: z.districts,
            states: z.states,
            shippingFee: Number(fees[i]),
            isActive: true,
          };
          const data = await post({ action: "create", rate: draft });
          created.push({ ...draft, id: data.rate?.id ?? Date.now() + i });
        }
        onSaved(created, `Added the ${bandLabel({ min: lo, max: hi }).toLowerCase()} band.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });

  return (
    <Dialog open onClose={onClose} title="New weight band" wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !pending) save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>From (grams)</span>
            <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} className={inputClass + " tabular-nums"} />
          </label>
          <label className="block">
            <span className={labelClass}>To (grams)</span>
            <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} className={inputClass + " tabular-nums"} autoFocus />
          </label>
        </div>
        {overlaps ? <p className="text-xs text-amber-700">This overlaps a band you already have. Start after {top ? grams(top.max) : "it"}.</p> : null}
        <div>
          <p className={labelClass}>Price for each zone (₹, including GST)</p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {zones.map((z, i) => (
              <label key={z.zoneName} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{z.zoneName}</span>
                <span className="w-28 shrink-0">
                  <input
                    inputMode="decimal"
                    value={fees[i]}
                    onChange={(e) => setFees(fees.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="—"
                    aria-label={`${z.zoneName} price`}
                    className={inputClass + " tabular-nums"}
                  />
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Leave a zone empty to skip it.</p>
        </div>
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={buttonClass("ghost")} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className={buttonClass("primary")} disabled={!valid || pending}>
            {pending ? "Saving…" : "Add band"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
