import { toNumber } from "./utils";

export type CartLine = {
  qty: number;
  rate: number;
  gstRate: number;
  discountPercent?: number;
  discountType?: "percent" | "value";
  discountValue?: number;
};

export type GstBreakdown = {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  /** Delta applied so grandTotal is a whole rupee (can be negative). */
  roundOff?: number;
};

/** Round to nearest rupee: ≥50 paise up, otherwise down. */
export function roundToRupee(amount: number): number {
  return Math.round(amount);
}

/** Apply nearest-rupee rounding to an existing GST breakdown (sales bills). */
export function applyRupeeRounding(gst: GstBreakdown): GstBreakdown {
  const before = Math.round(gst.grandTotal * 100) / 100;
  const after = roundToRupee(before);
  return {
    ...gst,
    grandTotal: after,
    roundOff: Math.round((after - before) * 100) / 100,
  };
}

export function calculateLineAmount(
  qty: number,
  rate: number,
  discountValue = 0,
  discountType: "percent" | "value" = "percent"
) {
  const gross = qty * rate;
  let discount = 0;
  if (discountType === "percent") {
    discount = (gross * discountValue) / 100;
  } else {
    discount = discountValue;
  }
  return Math.round((gross - discount) * 100) / 100;
}

export function calculateGstBreakdown(
  lines: CartLine[],
  options: { interstate?: boolean; billDiscount?: number } = {}
): GstBreakdown {
  const { interstate = false, billDiscount = 0 } = options;
  let subtotal = 0;
  let totalGst = 0;

  for (const line of lines) {
    const discVal = line.discountValue !== undefined ? line.discountValue : (line.discountPercent ?? 0);
    const discType = line.discountType ?? "percent";
    const lineAmount = calculateLineAmount(
      line.qty,
      line.rate,
      discVal,
      discType
    );
    subtotal += lineAmount;
    totalGst += (lineAmount * toNumber(line.gstRate)) / 100;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const discountAmount = Math.round(billDiscount * 100) / 100;
  const taxableAmount = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  const discountRatio = subtotal > 0 ? taxableAmount / subtotal : 1;
  totalGst = Math.round(totalGst * discountRatio * 100) / 100;

  if (interstate) {
    return {
      subtotal,
      discountAmount,
      taxableAmount,
      cgst: 0,
      sgst: 0,
      igst: totalGst,
      grandTotal: Math.round((taxableAmount + totalGst) * 100) / 100,
    };
  }

  const half = Math.round((totalGst / 2) * 100) / 100;
  return {
    subtotal,
    discountAmount,
    taxableAmount,
    cgst: half,
    sgst: totalGst - half,
    igst: 0,
    grandTotal: Math.round((taxableAmount + totalGst) * 100) / 100,
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

export function inferCategory(productName: string): string {
  const name = productName.toUpperCase();
  if (name.includes("SEED")) return "Seeds";
  if (
    name.includes("FERTILIZER") ||
    name.includes("MAHADHAN") ||
    name.includes("DAP") ||
    name.includes("UREA")
  )
    return "Fertilizers";
  if (
    name.includes("PESTICIDE") ||
    name.includes("INSECTICIDE") ||
    name.includes("FUNGICIDE") ||
    name.includes("TPCK") ||
    name.includes("TRAP")
  )
    return "Pesticides";
  if (name.includes("FT ") || name.includes("DRIP") || name.includes("HOSE"))
    return "Irrigation";
  if (
    name.includes("WEEDER") ||
    name.includes("HARVEST") ||
    name.includes("TRANSPLANT") ||
    name.includes("MOWER") ||
    name.includes("KUBOTA")
  )
    return "Machinery";
  if (name.startsWith("B") || name.includes("GROW BAG") || name.includes("PROTRAY"))
    return "Grow Bags & Trays";
  if (name.includes("POT") || name.includes("TOOL") || name.includes("SECATUR"))
    return "Garden Tools";
  return "General";
}

export function parseSkuFromName(name: string): string | null {
  const match = name.match(/^([A-Z]{2,6}\d{3,4}|[A-Z]{2,5}\s*\d+)/);
  return match ? match[1].replace(/\s+/g, "") : null;
}

export function isInterstateGst(
  customerGstin: string | null | undefined,
  businessStateCode: string
): boolean {
  const gstin = customerGstin?.trim().toUpperCase() || "";
  if (gstin.length < 2) return false;
  const customerState = gstin.slice(0, 2);
  const businessState = businessStateCode.trim().padStart(2, "0");
  return customerState !== businessState;
}

export function getProductRate(
  product: {
    saleRate: string;
    wholesaleRate: string | null;
  },
  billType: "retail" | "wholesale" | "others"
) {
  // "others" prices like retail (product sale rate).
  if (billType === "wholesale" && product.wholesaleRate) {
    return toNumber(product.wholesaleRate);
  }
  return toNumber(product.saleRate);
}

/**
 * POS / sale-entry rate for a specific batch. Prefers the batch sale rate so
 * different lots can bill at their own price; wholesale still uses the
 * product wholesale rate when set.
 */
export function getBatchBillingRate(
  row: {
    saleRate: string | number | null;
    wholesaleRate?: string | number | null;
    batchSaleRate?: string | number | null;
  },
  billType: "retail" | "wholesale" | "others" | "sale" | "purchase"
) {
  const productSale = toNumber(row.saleRate);
  const batchSale = toNumber(row.batchSaleRate);
  const wholesale = toNumber(row.wholesaleRate);
  if (billType === "wholesale") {
    if (wholesale > 0) return wholesale;
    if (batchSale > 0) return batchSale;
    return productSale;
  }
  if (batchSale > 0) return batchSale;
  return productSale;
}

/** GST-inclusive customer price from exclusive sale rate. */
export function inclusiveSalePrice(
  saleRate: number | string,
  gstRate: number | string
) {
  const rate = toNumber(saleRate);
  const gst = toNumber(gstRate);
  if (gst <= 0) return rate;
  return Math.round(rate * (1 + gst / 100) * 100) / 100;
}

/** Validate POS cart quantity against stock (pure helper for tests/UI). */
export function normalizeCartQty(
  raw: number,
  availableQty: number,
  hasStockLimit: boolean
): number | null {
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const next = Math.round(raw * 100) / 100;
  if (hasStockLimit && next > availableQty) return null;
  return next;
}
