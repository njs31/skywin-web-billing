/** Indian financial year helpers (1 Apr – 31 Mar). */

export function getIndianFinancialYearBounds(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based; April = 3
  const startYear = month >= 3 ? year : year - 1;
  const start = new Date(startYear, 3, 1, 0, 0, 0, 0);
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
  return { start, end, label: `${startYear}-${String(startYear + 1).slice(-2)}` };
}
