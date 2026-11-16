export type TeamOrderStatus = "Paid" | "Shipped" | "Cancelled" | "Refunded" | "Partly refunded";

export function teamOrderStatus(input: {
  status: string | null;
  refunded: number;
  total: number;
  waybill: string;
}): TeamOrderStatus {
  if ((input.status || "").toLowerCase() === "cancelled") return "Cancelled";
  if (input.refunded > 0 && input.total > 0 && input.refunded + 0.5 >= input.total) return "Refunded";
  if (input.refunded > 0) return "Partly refunded";
  if (input.waybill.trim()) return "Shipped";
  return "Paid";
}

/** The field officer who placed the order, then the farmer's assigned officer. */
export function teamOrderOfficerId(
  officers: { id: number; name: string }[],
  order: { assignedOfficerId: number | null; operatorName: string | null }
) {
  const takenBy = (order.operatorName || "").replace(/^Field · /i, "").trim().toLowerCase();
  if (takenBy) {
    const match = officers.find((officer) => officer.name.trim().toLowerCase() === takenBy);
    if (match) return match.id;
  }
  if (order.assignedOfficerId && officers.some((officer) => officer.id === order.assignedOfficerId)) {
    return order.assignedOfficerId;
  }
  return null;
}
