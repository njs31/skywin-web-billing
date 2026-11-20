/**
 * Who may use SkyWin Shipping (shipping.qwicksapp.com, /shipping pages and /api/shipping/*).
 * Kept in server code on purpose: change this list and redeploy to add or remove someone.
 */
export const SHIPPING_ALLOWED_PHONES: readonly string[] = ["6360334274", "9445059191", "9894059895"];

export const SHIPPING_HOST = "shipping.qwicksapp.com";

export const SHIPPING_DENIED_MESSAGE = "This number is not allowed to sign in to SkyWin Shipping.";

/** 10-digit Indian mobile from "+91 63603 34274", "916360334274", "06360334274", etc. Null if not one. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  else if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  return /^\d{10}$/.test(d) ? d : null;
}

export function isShippingAllowedPhone(raw: string | null | undefined): boolean {
  const phone = normalizeIndianMobile(raw);
  return !!phone && SHIPPING_ALLOWED_PHONES.includes(phone);
}

/** Host from x-forwarded-host / host, lower-case, without port. */
export function hostName(raw: string | null | undefined): string {
  return String(raw ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
}

export function isShippingHost(raw: string | null | undefined): boolean {
  return hostName(raw) === SHIPPING_HOST;
}
