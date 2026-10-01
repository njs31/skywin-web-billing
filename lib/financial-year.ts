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
 * with 0, `/` or `-`). Single shared definition used by the retail
 * numbering below and by the e-invoice payload validator, so the number
 * the counter prints is always a number the IRP accepts.
 */
export const IRP_DOC_NO_PATTERN = /^([a-zA-Z1-9]{1}[a-zA-Z0-9/-]{0,15})$/;

export function isIrpCompatibleDocNo(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return v.length >= 1 && v.length <= 16 && IRP_DOC_NO_PATTERN.test(v);
}

/**
 * Retail invoice series, IRP-compatible by construction: `INV-YYMMDD-NNNN`
 * (e.g. INV-261001-0001). 3 + 1 + 6 + 1 + 4 = 15 chars, leaving one spare
 * char before the 16-char IRP ceiling; the sequence grows past 4 digits
 * (0538-style zero padding is display only) and `assertRetailInvoiceNo`
 * refuses anything that would cross the ceiling instead of emitting it.
 *
 * Old retail numbers (`INV-YYYYMMDD-NNNN`, 17+ chars) are deliberately a
 * different shape: the SQL `LIKE 'INV-<yymmdd>-%'` scope for allocating the
 * next sequence can never match an old-format row, and vice versa, so the
 * two series coexist without renumbering anything.
 */
export const RETAIL_INVOICE_PREFIX = "INV";

export function retailInvoiceDayStamp(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export function formatRetailInvoiceNo(
  prefix: string,
  dayStamp: string,
  seq: number
): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`Invalid retail invoice sequence: ${seq}`);
  }
  const padded = String(seq).padStart(4, "0");
  return `${prefix}-${dayStamp}-${padded}`;
}

/** Fail closed: never let a non-IRP-compatible number leave generation. */
export function assertRetailInvoiceNo(invoiceNo: string): void {
  if (!isIrpCompatibleDocNo(invoiceNo)) {
    throw new Error(
      `Generated invoice number "${invoiceNo}" is not IRP-compatible ` +
        "(max 16 chars) — refusing to save the bill."
    );
  }
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
