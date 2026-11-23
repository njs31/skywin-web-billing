"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MapPin, Navigation, Printer, Route as RouteIcon, Building2 } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";
import { saveFieldOfficeLocation } from "@/lib/actions/field";
import { googleMapsLegs, loopKm, planRoute, type LatLng } from "@/lib/route-plan";
import type { RouteStop } from "@/lib/queries/field-route";
import { Notice, PageHeader, StatCard, StatGrid, buttonClass, inputClass } from "@/components/field/kit";
import { useFieldLang, useFieldText } from "@/components/field/lang";
import { fieldLocale, fmt } from "@/lib/field-i18n";
import { formatCurrency, cn } from "@/lib/utils";

export function RoutePlanner({ office, stops }: { office: LatLng | null; stops: RouteStop[] }) {
  const t = useFieldText();
  const r = t.route;
  const stages = t.stages as Record<string, string>;
  const locale = fieldLocale(useFieldLang());
  const router = useRouter();
  const [officeText, setOfficeText] = useState(office ? `${office.lat}, ${office.lng}` : "");
  const [editingOffice, setEditingOffice] = useState(!office);
  const [officeError, setOfficeError] = useState("");
  const [saving, startSaving] = useTransition();

  const located = useMemo(() => stops.filter((s): s is RouteStop & { location: LatLng } => !!s.location), [stops]);
  const unlocated = useMemo(() => stops.filter((s) => !s.location), [stops]);

  const ordered = useMemo(() => {
    if (!office) return [];
    return planRoute(office, located.map((s) => s.location)).map((i) => located[i]);
  }, [office, located]);
  const km = office ? loopKm(office, ordered.map((s) => s.location)) : 0;
  const legs = office ? googleMapsLegs(office, ordered.map((s) => s.location)) : [];

  function saveOffice() {
    setOfficeError("");
    startSaving(async () => {
      try {
        await saveFieldOfficeLocation(officeText);
        setEditingOffice(false);
        router.refresh();
      } catch (err) {
        setOfficeError(err instanceof Error ? err.message : r.officeFailed);
      }
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 print:space-y-3">
      <PageHeader
        back={{ href: "/field/orders", label: t.nav.orders }}
        title={r.title}
        description={r.subtitle}
        actions={
          ordered.length ? (
            <button type="button" onClick={() => window.print()} className={cn(buttonClass("secondary", "sm"), "print:hidden")}>
              <Printer aria-hidden /> {r.print}
            </button>
          ) : null
        }
      />

      <StatGrid>
        <StatCard icon={<RouteIcon />} label={r.statPending} value={stops.length.toLocaleString("en-IN")} sub={r.statPendingSub} />
        <StatCard icon={<MapPin />} label={r.statOnRoute} value={ordered.length.toLocaleString("en-IN")} sub={r.statOnRouteSub} />
        <StatCard icon={<Navigation />} label={r.statDistance} value={office && ordered.length ? `${Math.round(km).toLocaleString("en-IN")} km` : "—"} sub={r.statDistanceSub} />
        <StatCard dark icon={<MapPin />} label={r.statNoLocation} value={unlocated.length.toLocaleString("en-IN")} sub={r.statNoLocationSub} />
      </StatGrid>

      <section className="rounded-2xl border border-[#1E3317]/10 bg-white p-4 shadow-sm print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EDF2E7] text-[#3E5E2F]">
            <Building2 className="h-4 w-4" aria-hidden />
          </span>
          {editingOffice ? (
            <form
              className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(e) => {
                e.preventDefault();
                saveOffice();
              }}
            >
              <label className="sr-only" htmlFor="office-location">
                {r.officeLabel}
              </label>
              <input
                id="office-location"
                value={officeText}
                onChange={(e) => setOfficeText(e.target.value)}
                placeholder={r.officePh}
                className={cn(inputClass, "h-10 flex-1")}
              />
              <div className="flex gap-2">
                <button type="submit" disabled={saving || !officeText.trim()} className={buttonClass("primary", "sm")}>
                  {saving ? t.common.saving : r.officeSave}
                </button>
                {office ? (
                  <button type="button" onClick={() => setEditingOffice(false)} className={buttonClass("ghost", "sm")}>
                    {t.common.cancel}
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[#1E3317]">
                <span className="font-semibold">{r.officeLabel}:</span> {office ? `${office.lat}, ${office.lng}` : "—"}
              </p>
              <button type="button" onClick={() => setEditingOffice(true)} className={buttonClass("ghost", "sm")}>
                {r.officeChange}
              </button>
            </div>
          )}
        </div>
        {!office ? <p className="mt-2 text-xs text-[#5E6B62]">{r.officeHelp}</p> : null}
        {officeError ? <p role="alert" className="mt-2 text-xs font-medium text-[#8E3B34]">{officeError}</p> : null}
      </section>

      {!office ? (
        <Notice tone="amber">{r.needOffice}</Notice>
      ) : ordered.length === 0 ? (
        <Notice tone="green">{stops.length ? r.noneLocated : r.nonePending}</Notice>
      ) : (
        <>
          <RouteMap office={office} stops={ordered} labels={{ office: r.office }} />

          <div className="flex flex-wrap gap-2 print:hidden">
            {legs.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className={buttonClass(i === 0 ? "primary" : "secondary", "sm")}>
                <ExternalLink aria-hidden /> {legs.length === 1 ? r.openMaps : fmt(r.openMapsLeg, { n: i + 1, total: legs.length })}
              </a>
            ))}
          </div>

          <ol className="overflow-hidden rounded-2xl border border-[#1E3317]/10 bg-white shadow-sm">
            <li className="flex items-center gap-3 border-b border-[#1E3317]/8 bg-[#FAFBF7] px-4 py-3 text-sm font-semibold text-[#1E3317]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1E3317] text-white">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
              </span>
              {r.startOffice}
            </li>
            {ordered.map((s, i) => (
              <li key={s.saleId} className="flex gap-3 border-b border-[#1E3317]/8 px-4 py-3 last:border-b-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B8D94A] text-xs font-bold text-[#1E3317]">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1E3317]">
                    {s.farmerName || "—"}
                    {s.farmerPhone ? (
                      <a href={`tel:+91${s.farmerPhone.replace(/\D/g, "").slice(-10)}`} className="ml-2 text-xs font-medium text-[#245B3E] hover:underline">
                        {s.farmerPhone}
                      </a>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-[#5E6B62]">
                    <span className="font-mono">{s.orderId}</span>
                    {s.source === "qwicks" ? ` · ${t.orders.qwicksTag}` : ""} · {fmt(r.items, { n: s.items })} · {formatCurrency(s.total)}
                    {s.stage ? ` · ${stages[s.stage] ?? s.stage}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#5E6B62]">
                    {s.location.lat}, {s.location.lng} · {s.locationFrom === "farm" ? r.fromFarm : r.fromOrder} ·{" "}
                    {new Date(s.date).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
                  </p>
                </div>
              </li>
            ))}
            <li className="flex items-center gap-3 bg-[#FAFBF7] px-4 py-3 text-sm font-semibold text-[#1E3317]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1E3317] text-white">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
              </span>
              {r.backOffice}
            </li>
          </ol>
        </>
      )}

      {unlocated.length ? (
        <section className="rounded-2xl border border-dashed border-[#8A5A00]/30 bg-[#FFFBF2] p-4">
          <h2 className="text-sm font-semibold text-[#8A5A00]">{fmt(r.unlocatedTitle, { n: unlocated.length })}</h2>
          <p className="mt-1 text-xs text-[#5E6B62]">{r.unlocatedHelp}</p>
          <ul className="mt-2 space-y-1 text-xs text-[#29332C]">
            {unlocated.map((s) => (
              <li key={s.saleId}>
                <span className="font-mono">{s.orderId}</span> · {s.farmerName || "—"} {s.farmerPhone ? `· ${s.farmerPhone}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Leaflet map with OpenStreetMap tiles: the office, numbered stops and the loop between them. */
function RouteMap({ office, stops, labels }: { office: LatLng; stops: Array<RouteStop & { location: LatLng }>; labels: { office: string } }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    (async () => {
      try {
        const L = await import("leaflet");
        if (cancelled || !box.current) return;
        map = L.map(box.current, { scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        const pin = (html: string, cls: string) =>
          L.divIcon({ html, className: cls, iconSize: [28, 28], iconAnchor: [14, 14] });
        const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
        L.marker([office.lat, office.lng], { icon: pin("🏢", "route-pin route-pin-office"), title: labels.office, zIndexOffset: 1000 })
          .bindTooltip(esc(labels.office))
          .addTo(map);
        stops.forEach((s, i) => {
          L.marker([s.location.lat, s.location.lng], { icon: pin(String(i + 1), "route-pin"), title: `${i + 1}. ${s.farmerName}` })
            .bindTooltip(esc(`${i + 1}. ${s.farmerName || ""} · ${s.orderId}`))
            .addTo(map!);
        });
        const path: Array<[number, number]> = [
          [office.lat, office.lng],
          ...stops.map((s) => [s.location.lat, s.location.lng] as [number, number]),
          [office.lat, office.lng],
        ];
        const line = L.polyline(path, { color: "#245B3E", weight: 3, opacity: 0.85, dashArray: "6 6" }).addTo(map);
        map.fitBounds(line.getBounds(), { padding: [32, 32], maxZoom: 15 });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [office, stops, labels.office]);

  if (failed) return null;
  return (
    <>
      <style>{`
        .route-pin { display:flex; align-items:center; justify-content:center; border-radius:9999px; background:#B8D94A; color:#1E3317; font:700 12px/1 system-ui, sans-serif; border:2px solid #1E3317; box-shadow:0 1px 4px rgba(0,0,0,.3); }
        .route-pin-office { background:#fff; font-size:14px; }
      `}</style>
      <div ref={box} className="h-[420px] w-full overflow-hidden rounded-2xl border border-[#1E3317]/10 shadow-sm print:h-[360px]" role="img" aria-label="Delivery route map" />
    </>
  );
}
