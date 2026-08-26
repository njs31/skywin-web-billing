/** Indian financial year helpers (1 Apr – 31 Mar). */

export function getIndianFinancialYearBounds(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based; April = 3
  const startYear = month >= 3 ? year : year - 1;
  const start = new Date(startYear, 3, 1, 0, 0, 0, 0);
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
  const endYearShort = String(startYear + 1).slice(-2);
  const startYearShort = String(startYear).slice(-2);
  return {
    start,
    end,
    /** e.g. 2026-27 */
    label: `${startYear}-${endYearShort}`,
    /** e.g. 26-27 — used in wholesale invoice series SKYA/####/YY-YY */
    shortLabel: `${startYearShort}-${endYearShort}`,
  };
}

/** Wholesale invoice series: SKYA/0379/26-27 */
export const WHOLESALE_INVOICE_PREFIX = "SKYA";
/** Floor so the next allocated number is at least 379. */
export const WHOLESALE_INVOICE_SEQ_FLOOR = 378;

export function nextWholesaleSequence(maxExistingSeq = 0) {
  return Math.max(maxExistingSeq, WHOLESALE_INVOICE_SEQ_FLOOR) + 1;
}

/** Format a wholesale invoice number, e.g. SKYA/0379/26-27 */
export function formatWholesaleInvoiceNo(seq: number, fyShortLabel: string) {
  return `${WHOLESALE_INVOICE_PREFIX}/${String(seq).padStart(4, "0")}/${fyShortLabel}`;
}
