/** Helpers for cash/card/UPI settlement and auto credit (receipt) entries. */

export type CounterPaymentMode = "cash" | "upi" | "credit" | "card" | "cheque";

export type AutoReceiptPart = {
  paymentMode: "cash" | "upi" | "card" | "cheque";
  amount: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Split a settled (non-credit) sale into receipt voucher lines.
 * Cash + UPI split bills produce two credits; card/cheque produce one.
 */
export function buildAutoReceiptParts(input: {
  paymentMode: CounterPaymentMode;
  paidAmount: number;
  cashAmount: number;
  upiAmount: number;
}): AutoReceiptPart[] {
  if (input.paymentMode === "credit") return [];
  if (round2(input.paidAmount) <= 0) return [];

  const parts: AutoReceiptPart[] = [];
  if (round2(input.cashAmount) > 0) {
    parts.push({ paymentMode: "cash", amount: round2(input.cashAmount) });
  }
  if (round2(input.upiAmount) > 0) {
    parts.push({ paymentMode: "upi", amount: round2(input.upiAmount) });
  }
  if (parts.length === 0) {
    const mode =
      input.paymentMode === "card" || input.paymentMode === "cheque"
        ? input.paymentMode
        : input.paymentMode === "upi"
          ? "upi"
          : "cash";
    parts.push({ paymentMode: mode, amount: round2(input.paidAmount) });
  }
  return parts;
}

export function invoiceSettlement(input: {
  paymentMode: string;
  grandTotal: number;
  paidAmount: number;
  cashAmount?: number;
  upiAmount?: number;
}) {
  const total = round2(input.grandTotal);
  const paid = round2(input.paidAmount);
  const received = input.paymentMode === "credit" ? paid : paid > 0 ? paid : total;
  const balance = round2(Math.max(0, total - received));
  const parts = buildAutoReceiptParts({
    paymentMode: (input.paymentMode as CounterPaymentMode) || "cash",
    paidAmount: received,
    cashAmount: input.cashAmount ?? 0,
    upiAmount: input.upiAmount ?? 0,
  });
  const label =
    parts.length > 1
      ? parts.map((p) => p.paymentMode.toUpperCase()).join(" + ")
      : parts[0]?.paymentMode.toUpperCase() || input.paymentMode.toUpperCase();
  return { received, balance, label, parts };
}

export const SALES_REPORT_MODE_ORDER = [
  "cash",
  "upi",
  "card",
  "cheque",
  "credit",
] as const;

export function compareSalesReportRows(
  a: { date: Date | string; invoiceNo: string; id?: number },
  b: { date: Date | string; invoiceNo: string; id?: number }
) {
  const ta = new Date(a.date).getTime();
  const tb = new Date(b.date).getTime();
  if (ta !== tb) return ta - tb;
  const byInvoice = a.invoiceNo.localeCompare(b.invoiceNo, "en", {
    numeric: true,
  });
  if (byInvoice !== 0) return byInvoice;
  return (a.id ?? 0) - (b.id ?? 0);
}

export function sortPaymentModeEntries<T>(
  entries: Array<[string, T]>
): Array<[string, T]> {
  return [...entries].sort(([a], [b]) => {
    const ia = SALES_REPORT_MODE_ORDER.indexOf(
      a as (typeof SALES_REPORT_MODE_ORDER)[number]
    );
    const ib = SALES_REPORT_MODE_ORDER.indexOf(
      b as (typeof SALES_REPORT_MODE_ORDER)[number]
    );
    const sa = ia === -1 ? 99 : ia;
    const sb = ib === -1 ? 99 : ib;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}
