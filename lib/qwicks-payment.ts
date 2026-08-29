export type QwicksPaymentMode = "cash" | "upi";

/**
 * Read the payment method off a QwicksApp order payload and map it to a Skywin
 * payment mode. QwicksApp is an online store, so anything that is not clearly
 * cash / cash-on-delivery is treated as a digital (UPI) collection. Previously
 * every Qwicks order was hard-coded to "upi", so cash orders showed as UPI.
 */
export function mapQwicksPaymentMode(body: unknown): {
  mode: QwicksPaymentMode;
  raw: string;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const payment = (b.payment ?? {}) as Record<string, unknown>;
  const raw = String(
    b.paymentMode ??
      b.paymentMethod ??
      payment.mode ??
      payment.method ??
      (typeof b.payment === "string" ? b.payment : "") ??
      b.paymentType ??
      ""
  ).trim();
  const norm = raw.toLowerCase();
  const isCash =
    norm === "cash" ||
    norm === "cod" ||
    norm.includes("cash on delivery") ||
    norm.includes("cash-on-delivery") ||
    (norm.includes("cash") && !norm.includes("upi"));
  return { mode: isCash ? "cash" : "upi", raw };
}
