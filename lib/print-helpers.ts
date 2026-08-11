import { toNumber } from "@/lib/utils";

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ""}`.trim();
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h && rest) return `${ONES[h]} Hundred ${twoDigits(rest)}`;
  if (h) return `${ONES[h]} Hundred`;
  return twoDigits(rest);
}

/** Convert amount to Indian English words, e.g. "Twenty Two Thousand and Twelve only". */
export function amountInIndianWords(amount: number | string): string {
  const n = Math.round(toNumber(amount));
  if (n === 0) return "Zero only";
  if (n < 0) return `Minus ${amountInIndianWords(-n)}`;

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return `${joined} only`;
}

export type GstSlabRow = {
  rate: number;
  taxable: number;
  sgst: number;
  cgst: number;
  gstVal: number;
};

const SLAB_RATES = [0, 5, 12, 18, 28] as const;

/** Build 0/5/12/18/28% GST summary rows from line items. */
export function buildGstSlabSummary(
  lines: Array<{ amount: number | string; gstRate: number | string }>
): GstSlabRow[] {
  const map = new Map<number, { taxable: number; gstVal: number }>();
  for (const rate of SLAB_RATES) {
    map.set(rate, { taxable: 0, gstVal: 0 });
  }

  for (const line of lines) {
    const taxable = toNumber(line.amount);
    const rate = Math.round(toNumber(line.gstRate));
    const bucket = SLAB_RATES.includes(rate as (typeof SLAB_RATES)[number])
      ? rate
      : rate;
    if (!map.has(bucket)) map.set(bucket, { taxable: 0, gstVal: 0 });
    const row = map.get(bucket)!;
    row.taxable += taxable;
    row.gstVal += Math.round(((taxable * toNumber(line.gstRate)) / 100) * 100) / 100;
  }

  return SLAB_RATES.map((rate) => {
    const row = map.get(rate) || { taxable: 0, gstVal: 0 };
    const half = Math.round((row.gstVal / 2) * 100) / 100;
    return {
      rate,
      taxable: Math.round(row.taxable * 100) / 100,
      sgst: half,
      cgst: Math.round((row.gstVal - half) * 100) / 100,
      gstVal: Math.round(row.gstVal * 100) / 100,
    };
  });
}

export const SKYWIN_PRINT_TERMS = [
  "Goods once sold will not be taken back or exchanged.",
  "Bills not paid due date will attract 24% interest.",
  "All disputes subject to Jurisdiction only.",
  "THANKS FOR COMING. COME AND VISIT AGAIN",
] as const;
