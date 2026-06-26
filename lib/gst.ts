import { toNumber } from "./utils";

export type CartLine = {
  qty: number;
  rate: number;
  gstRate: number;
};

export type GstBreakdown = {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
};

export function calculateLineAmount(qty: number, rate: number) {
  return Math.round(qty * rate * 100) / 100;
}

export function calculateGstBreakdown(
  lines: CartLine[],
  interstate = false
): GstBreakdown {
  let subtotal = 0;
  let totalGst = 0;

  for (const line of lines) {
    const lineAmount = calculateLineAmount(line.qty, line.rate);
    subtotal += lineAmount;
    totalGst += (lineAmount * toNumber(line.gstRate)) / 100;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  totalGst = Math.round(totalGst * 100) / 100;

  if (interstate) {
    return {
      subtotal,
      cgst: 0,
      sgst: 0,
      igst: totalGst,
      grandTotal: Math.round((subtotal + totalGst) * 100) / 100,
    };
  }

  const half = Math.round((totalGst / 2) * 100) / 100;
  return {
    subtotal,
    cgst: half,
    sgst: totalGst - half,
    igst: 0,
    grandTotal: Math.round((subtotal + totalGst) * 100) / 100,
  };
}

export function inferGstRate(productName: string): number {
  const name = productName.toUpperCase();
  if (
    name.includes("FERTILIZER") ||
    name.includes("MAHADHAN") ||
    name.includes("DAP") ||
    name.includes("UREA") ||
    name.includes("SEED")
  ) {
    return 5;
  }
  if (
    name.includes("SPRAY") ||
    name.includes("PESTICIDE") ||
    name.includes("INSECTICIDE") ||
    name.includes("FUNGICIDE")
  ) {
    return 12;
  }
  return 18;
}

export function parseSkuFromName(name: string): string | null {
  const match = name.match(/^([A-Z]{2,6}\d{3,4}|[A-Z]{2,5}\s*\d+)/);
  return match ? match[1].replace(/\s+/g, "") : null;
}
