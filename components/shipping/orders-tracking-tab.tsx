"use client";

import { useState, useTransition } from "react";
import {
  Package,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  RotateCcw,
  XCircle,
  Bell,
  MapPin,
  ChevronRight,
  Filter,
  Calendar,
  Send,
  AlertCircle,
  User,
  Phone,
} from "lucide-react";
import { SHIPPING_CHECKPOINTS, type ShippingCheckpoint } from "@/lib/delivery/shipping-constants";

export type OrderRow = {
  id: number;
  orderId: string;
  invoiceNo: string | null;
  date: string;
  customerName: string | null;
  customerPhone: string | null;
  grandTotal: number;
  status: string;
  deliveryNote?: string | null;
  transporterName?: string | null;
  destination?: string | null;
  currentCheckpoint: ShippingCheckpoint;
  checkpointsHistory?: Array<{
    id: number;
    checkpoint: string;
    note?: string | null;
    location?: string | null;
    updatedBy?: string | null;
    createdAt: string;
  }>;
  items: Array<{
    name: string;
    qty: number;
    amount: number;
  }>;
};

export function OrdersTrackingTab({ initialOrders }: { initialOrders: OrderRow[] }) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [search, setSearch] = useState("");
  const [filterCheckpoint, setFilterCheckpoint] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

  // Modal / Checkpoint update state
  const [targetOrder, setTargetOrder] = useState<OrderRow | null>(null);
  const [newCheckpoint, setNewCheckpoint] = useState<ShippingCheckpoint>("Order Processing");
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const filteredOrders = orders.filter((o) => {
    const q = search.toLowerCase().trim();
    const matchQuery =
      !q ||
      o.orderId.toLowerCase().includes(q) ||
      (o.invoiceNo && o.invoiceNo.toLowerCase().includes(q)) ||
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      (o.customerPhone && o.customerPhone.includes(q)) ||
      (o.destination && o.destination.toLowerCase().includes(q));

    const matchFilter =
      filterCheckpoint === "all" || o.currentCheckpoint === filterCheckpoint;

    return matchQuery && matchFilter;
  });

  const handleOpenUpdate = (order: OrderRow) => {
    setTargetOrder(order);
    // Suggest the next natural checkpoint
    const currentIdx = SHIPPING_CHECKPOINTS.indexOf(order.currentCheckpoint);
    const nextCp =
      currentIdx >= 0 && currentIdx < 5
        ? SHIPPING_CHECKPOINTS[currentIdx + 1]
        : order.currentCheckpoint;
    setNewCheckpoint(nextCp);
    setNote("");
    setLocation(order.destination || "Kumbakonam Hub");
    setFeedback(null);
  };

  const handleSaveCheckpoint = () => {
    if (!targetOrder || pending) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/shipping/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: targetOrder.orderId,
            saleId: targetOrder.id,
            checkpoint: newCheckpoint,
            note: note.trim() || undefined,
            location: location.trim() || undefined,
            updatedBy: "Office Dispatch",
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update checkpoint");

        // Update local state
        setOrders((prev) =>
          prev.map((o) => {
            if (o.orderId === targetOrder.orderId) {
              const newHist = [
                {
                  id: Date.now(),
                  checkpoint: newCheckpoint,
                  note: note.trim() || null,
                  location: location.trim() || null,
                  updatedBy: "Office Dispatch",
                  createdAt: new Date().toISOString(),
                },
                ...(o.checkpointsHistory || []),
              ];
              return {
                ...o,
                currentCheckpoint: newCheckpoint,
                checkpointsHistory: newHist,
                destination: location.trim() || o.destination,
              };
            }
            return o;
          })
        );

        setFeedback({
          success: true,
          message: `Checkpoint updated to "${newCheckpoint}". Push notification sent to farmer!`,
        });

        setTimeout(() => {
          setTargetOrder(null);
          setFeedback(null);
        }, 1500);
      } catch (err) {
        setFeedback({
          success: false,
          message: err instanceof Error ? err.message : "Failed to record checkpoint",
        });
      }
    });
  };

  const getBadgeStyle = (cp: ShippingCheckpoint) => {
    switch (cp) {
      case "Order Received":
        return "bg-slate-100 text-slate-800 border-slate-300";
      case "Order Processing":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "Dispatched":
        return "bg-indigo-100 text-indigo-800 border-indigo-300";
      case "In transit":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "Out for delivery":
        return "bg-purple-100 text-purple-800 border-purple-300";
      case "Delivered":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "Refunded":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "Order Cancelled":
        return "bg-rose-100 text-rose-800 border-rose-300";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Header */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Order ID, farmer, phone, PIN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50"
          />
        </div>

        {/* Checkpoint filter dropdown */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filterCheckpoint}
            onChange={(e) => setFilterCheckpoint(e.target.value)}
            className="text-xs border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">All Checkpoints ({orders.length})</option>
            {SHIPPING_CHECKPOINTS.map((cp) => (
              <option key={cp} value={cp}>
                {cp}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-800">
              Orders for Dispatch & Tracking ({filteredOrders.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Click &quot;Update Checkpoint&quot; to notify the mobile app
          </span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Package className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-sm font-medium">No orders found matching your search</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Order & Invoice</th>
                  <th className="px-6 py-3.5">Farmer / Destination</th>
                  <th className="px-6 py-3.5">Items & Amount</th>
                  <th className="px-6 py-3.5">Current Checkpoint</th>
                  <th className="px-6 py-3.5 text-right">Office Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => (
                  <tr
                    key={order.orderId}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    {/* Order ID & Date */}
                    <td className="px-6 py-4 align-top">
                      <div className="font-bold text-slate-900 text-sm">
                        {order.orderId}
                      </div>
                      {order.invoiceNo && (
                        <div className="text-[11px] text-slate-500">
                          Inv: {order.invoiceNo}
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{order.date}</span>
                      </div>
                    </td>

                    {/* Farmer & Address */}
                    <td className="px-6 py-4 align-top">
                      <div className="font-medium text-slate-800 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span>{order.customerName || "Farmer"}</span>
                      </div>
                      {order.customerPhone && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3 text-slate-400" />
                          <span>{order.customerPhone}</span>
                        </div>
                      )}
                      {order.destination && (
                        <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 w-fit">
                          <MapPin className="h-3 w-3 text-emerald-600" />
                          <span>{order.destination}</span>
                        </div>
                      )}
                    </td>

                    {/* Items & Amount */}
                    <td className="px-6 py-4 align-top">
                      <div className="font-semibold text-slate-900">
                        ₹{order.grandTotal.toLocaleString("en-IN")}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate">
                        {order.items.map((i) => `${i.name} (x${i.qty})`).join(", ") ||
                          "Field Order Products"}
                      </div>
                    </td>

                    {/* Current Checkpoint */}
                    <td className="px-6 py-4 align-top">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${getBadgeStyle(
                          order.currentCheckpoint
                        )}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {order.currentCheckpoint}
                      </span>

                      {order.checkpointsHistory && order.checkpointsHistory.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="block text-[10px] text-emerald-600 hover:text-emerald-800 font-medium mt-1.5 underline"
                        >
                          View timeline ({order.checkpointsHistory.length} events)
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenUpdate(order)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                      >
                        <span>Update Checkpoint</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Checkpoint Update Modal */}
      {targetOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Update Checkpoint for {targetOrder.orderId}
                </h3>
                <p className="text-xs text-slate-500">
                  Farmer: {targetOrder.customerName || "Farmer"} (
                  {targetOrder.customerPhone || "No phone"})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTargetOrder(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  feedback.success
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {feedback.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Select Checkpoint */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select Checkpoint Step
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SHIPPING_CHECKPOINTS.map((cp, idx) => {
                    const isSelected = newCheckpoint === cp;
                    return (
                      <button
                        key={cp}
                        type="button"
                        onClick={() => setNewCheckpoint(cp)}
                        className={`text-left px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                          isSelected
                            ? "bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-500/20 font-bold"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-[10px] text-slate-400 mr-1.5 font-mono">
                          {idx + 1}.
                        </span>
                        <span>{cp}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Location / Hub (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Kumbakonam Central Hub, In transit to Thanjavur"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {/* Note Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dispatch Note / Tracking remark (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Dispatched via SkyWin Field van, driver Ramesh (9842100000)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5">
                <Bell className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-900 leading-relaxed">
                  Saving will <strong>instantly push a notification</strong> to the farmer’s
                  mobile app and update the order tracking stepper in real-time.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTargetOrder(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCheckpoint}
                disabled={pending}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {pending ? (
                  <span>Saving & Sending Push…</span>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Confirm & Send Push</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Timeline Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-end">
          <div className="bg-white h-full w-full max-w-md p-6 overflow-y-auto space-y-6 shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Tracking Timeline · {selectedOrder.orderId}
                </h3>
                <p className="text-xs text-slate-500">
                  Farmer: {selectedOrder.customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {/* Stepper Visualization */}
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {(selectedOrder.checkpointsHistory || []).map((step, idx) => (
                <div key={step.id || idx} className="relative">
                  <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-emerald-600 ring-4 ring-white" />
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">
                        {step.checkpoint}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(step.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {step.location && (
                      <p className="text-[11px] text-slate-600 flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        <span>{step.location}</span>
                      </p>
                    )}
                    {step.note && (
                      <p className="text-xs text-slate-700 bg-white p-2 rounded border border-slate-100 mt-1">
                        {step.note}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 pt-1">
                      Updated by {step.updatedBy || "Office"} on{" "}
                      {new Date(step.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="w-full py-2.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Close Timeline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
