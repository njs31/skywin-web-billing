import { inclusiveSalePrice } from "@/lib/gst";
import { formatNumber } from "@/lib/utils";

/** Trade name printed on bills. GST legal name stays SKYWIN BIOTECH. */
export const PRINT_TRADE_NAME = "SKYWIN AGRI SUPERMARKET";
export const DEFAULT_LANDLINE = "0435-2424899";
export const PRINT_LOGO_SRC = "/logo.avif";

export function printPhoneLine(
  mobile?: string | null,
  landline?: string | null
) {
  const parts = [
    mobile?.trim(),
    (landline?.trim() || DEFAULT_LANDLINE),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function thankYouMessage(tradeName = PRINT_TRADE_NAME) {
  return `Thank you for shopping at ${tradeName}`;
}

/** Inclusive unit sale rate shown in brackets under a line amount. */
export function saleRateBracket(
  rate: number | string,
  gstRate: number | string
) {
  return `(${formatNumber(inclusiveSalePrice(rate, gstRate), 2)})`;
}

/** Customer's area/place for invoices: village, else address, else taluk/district. */
export function customerArea(
  customer: {
    village?: string | null;
    address?: string | null;
    taluk?: string | null;
    district?: string | null;
  }
): string | null {
  const village = customer.village?.trim();
  if (village) return village;
  const address = customer.address?.trim();
  if (address) return address;
  const taluk = customer.taluk?.trim();
  const district = customer.district?.trim();
  if (taluk && district && taluk !== district) return `${taluk}, ${district}`;
  return taluk || district || null;
}
