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

/** Wholesale invoice series: SKYA/0385/26-27 */
export const WHOLESALE_INVOICE_PREFIX = "SKYA";
/** Floor so the next allocated number is at least 385. */
export const WHOLESALE_INVOICE_SEQ_FLOOR = 384;

/**
 * IRP-compatible document number (NIC schema: String(16), pattern
 * `^([a-zA-Z1-9]{1}[a-zA-Z0-9\/-]{0,15})$` — max 16 chars, must not start
 * with 0, `/` or `-`). Single shared definition used by the e-invoice
 * payload validator, so a bill that can't go to the IRP fails with one
 * clear message. (Retail bills intentionally use the longer 17-char
 * INV-YYYYMMDD-NNNN series — they are B2C and never pushed.)
 */
export const IRP_DOC_NO_PATTERN = /^([a-zA-Z1-9]{1}[a-zA-Z0-9/-]{0,15})$/;

export function isIrpCompatibleDocNo(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length >= 1 && v.length <= 16 && IRP_DOC_NO_PATTERN.test(v);
}export function nextWholesaleSequence(maxExistingSeq = 0) {
  return Math.max(maxExistingSeq, WHOLESALE_INVOICE_SEQ_FLOOR) + 1;
}

/** Format a wholesale invoice number, e.g. SKYA/0385/26-27 */
export function formatWholesaleInvoiceNo(seq: number, fyShortLabel: string) {
  return `${WHOLESALE_INVOICE_PREFIX}/${String(seq).padStart(4, "0")}/${fyShortLabel}`;
}

/** Sales-return series, continuous per financial year: e.g. SR/0001/26-27 */
export const SALE_RETURN_PREFIX = "SR";
export function formatSaleReturnNo(seq: number, fyShortLabel: string) {
  return `${SALE_RETURN_PREFIX}/${String(seq).padStart(4, "0")}/${fyShortLabel}`;
}
