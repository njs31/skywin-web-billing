"use client";

import { useState, useTransition } from "react";
import {
  Layers,
  Plus,
  RotateCcw,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  Tag,
  Info,
  DollarSign,
  Save,
} from "lucide-react";

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

export function RatesConfigTab({ initialRates }: { initialRates: RateItem[] }) {
  const [rates, setRates] = useState<RateItem[]>(initialRates);
  const [editingRate, setEditingRate] = useState<RateItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [pending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);

  // Group rates by weight slab
  const slabs = Array.from(new Set(rates.map((r) => r.slab)));

  const handleToggle = (id: number) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/shipping/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "toggle", rateId: id }),
        });
        if (!res.ok) throw new Error("Failed to toggle status");
        setRates((prev) =>
          prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : "Toggle failed");
      }
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to remove this rate rule?")) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/shipping/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", rateId: id }),
        });
        if (!res.ok) throw new Error("Failed to delete rule");
        setRates((prev) => prev.filter((r) => r.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : "Delete failed");
      }
    });
  };

  const handleSaveRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRate || pending) return;

    startTransition(async () => {
      try {
        const action = isNew ? "create" : "update";
        const res = await fetch("/api/shipping/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, rate: editingRate }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save rate");

        if (isNew && data.rate) {
          setRates((prev) => [...prev, { ...editingRate, id: data.rate.id }]);
        } else {
          setRates((prev) =>
            prev.map((r) => (r.id === editingRate.id ? editingRate : r))
          );
        }

        setStatusMessage({
          success: true,
          text: `Rate rule "${editingRate.zoneName}" saved successfully.`,
        });
        setTimeout(() => setStatusMessage(null), 3000);
        setEditingRate(null);
        setIsNew(false);
      } catch (err) {
        setStatusMessage({
          success: false,
          text: err instanceof Error ? err.message : "Save failed",
        });
      }
    });
  };

  const handleAddNew = () => {
    setIsNew(true);
    setEditingRate({
      id: 0,
      slab: "500 to 1kg",
      minWeightGrams: 501,
      maxWeightGrams: 1000,
      zoneName: "",
      regions: "",
      transitDays: "3 - 5 Days",
      shippingFee: 85.0,
      pincodes: "",
      districts: "",
      states: "",
      isActive: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-800">
              Weight & Destination Rate Matrix
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pre-seeded with official SkyWin rates. Rates update live on checkout without requiring app releases.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add New Rate Rule</span>
          </button>
        </div>
      </div>

      {/* GST Note Callout from PDF */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <strong>Tax Note from Rate Specification:</strong> On invoices, shipping
          prices follow the same GST % as the base product (e.g. shipping fertilizer with 5% GST has
          5% shipping GST; machinery with 18% GST has 18% shipping GST).
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
            statusMessage.success
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {statusMessage.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Slabs Tables */}
      <div className="space-y-8">
        {slabs.map((slabName) => {
          const slabRows = rates.filter((r) => r.slab === slabName);
          return (
            <div
              key={slabName}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    Weight Slab: {slabName}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    ({slabRows[0]?.minWeightGrams || 0}g - {slabRows[0]?.maxWeightGrams || 1000}g)
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {slabRows.length} Zones Configured
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 uppercase font-semibold border-b border-slate-100 bg-white">
                    <tr>
                      <th className="px-6 py-3">Zone & Destinations</th>
                      <th className="px-6 py-3">Transit Time</th>
                      <th className="px-6 py-3">Shipping Fee</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {slabRows.map((rate) => (
                      <tr
                        key={rate.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          !rate.isActive ? "opacity-50 bg-slate-50/30" : ""
                        }`}
                      >
                        <td className="px-6 py-4 align-top max-w-md">
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                            <span>{rate.zoneName}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                            {rate.regions}
                          </p>
                          {rate.pincodes && (
                            <span className="inline-block mt-1 text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-mono">
                              {rate.pincodes.split(",").length} specific PINs included
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 align-top font-medium text-slate-600">
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span>{rate.transitDays}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 align-top">
                          <div className="text-sm font-bold text-slate-900">
                            ₹{Number(rate.shippingFee).toFixed(2)}
                          </div>
                          <span className="text-[10px] text-slate-400">per order</span>
                        </td>

                        <td className="px-6 py-4 align-top">
                          <button
                            type="button"
                            onClick={() => handleToggle(rate.id)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                              rate.isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {rate.isActive ? "Active" : "Disabled"}
                          </button>
                        </td>

                        <td className="px-6 py-4 align-top text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsNew(false);
                              setEditingRate(rate);
                            }}
                            className="p-1.5 text-slate-400 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                            title="Edit Rate"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(rate.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Delete Rule"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit / Add Modal */}
      {editingRate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {isNew ? "Add New Shipping Rate Rule" : `Edit Rate: ${editingRate.zoneName}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingRate(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Weight Slab Label
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRate.slab}
                    onChange={(e) =>
                      setEditingRate({ ...editingRate, slab: e.target.value })
                    }
                    placeholder="e.g. 250gm-500gm or 1kg to 2kg"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Shipping Fee (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingRate.shippingFee}
                    onChange={(e) =>
                      setEditingRate({
                        ...editingRate,
                        shippingFee: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Min Weight (grams)
                  </label>
                  <input
                    type="number"
                    value={editingRate.minWeightGrams}
                    onChange={(e) =>
                      setEditingRate({
                        ...editingRate,
                        minWeightGrams: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Weight (grams)
                  </label>
                  <input
                    type="number"
                    value={editingRate.maxWeightGrams}
                    onChange={(e) =>
                      setEditingRate({
                        ...editingRate,
                        maxWeightGrams: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Zone / Destination Name
                </label>
                <input
                  type="text"
                  required
                  value={editingRate.zoneName}
                  onChange={(e) =>
                    setEditingRate({ ...editingRate, zoneName: e.target.value })
                  }
                  placeholder="e.g. Chennai & Suburbs, South Tamil Nadu"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Transit Time
                </label>
                <input
                  type="text"
                  value={editingRate.transitDays}
                  onChange={(e) =>
                    setEditingRate({ ...editingRate, transitDays: e.target.value })
                  }
                  placeholder="e.g. 1 - 3 Days or 3 - 5 Days"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Regions Description (readable text)
                </label>
                <textarea
                  rows={2}
                  value={editingRate.regions}
                  onChange={(e) =>
                    setEditingRate({ ...editingRate, regions: e.target.value })
                  }
                  placeholder="e.g. Tamil Nadu (Coimbatore, Madurai, Tuticorin...)"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Matched Districts (comma-separated, lowercase)
                </label>
                <input
                  type="text"
                  value={editingRate.districts}
                  onChange={(e) =>
                    setEditingRate({ ...editingRate, districts: e.target.value })
                  }
                  placeholder="e.g. coimbatore,madurai,tuticorin"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Matched States (comma-separated, lowercase)
                </label>
                <input
                  type="text"
                  value={editingRate.states}
                  onChange={(e) =>
                    setEditingRate({ ...editingRate, states: e.target.value })
                  }
                  placeholder="e.g. tamil nadu,kerala,karnataka"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Explicit PIN Codes (comma-separated, optional)
                </label>
                <textarea
                  rows={2}
                  value={editingRate.pincodes}
                  onChange={(e) =>
                    setEditingRate({ ...editingRate, pincodes: e.target.value })
                  }
                  placeholder="e.g. 600016, 600043, 600044..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono text-[11px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRate(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{pending ? "Saving Rate…" : "Save Rate Rule"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
