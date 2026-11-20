import { PUBLIC_SHIPPING_HOST, hostName, isShippingHost } from "@/lib/site-hosts";

/**
 * Who may use SkyWin Shipping (ship.qwicksapp.com and the old shipping.qwicksapp.com, /shipping pages and /api/shipping/*).
 * Kept in server code on purpose: change this list and redeploy to add or remove someone.
 */
export const SHIPPING_ALLOWED_PHONES: readonly string[] = ["6360334274", "9445059191", "9894059895"];

/** Shipping hostname used in links (both ship.qwicksapp.com and shipping.qwicksapp.com are accepted). */
export const SHIPPING_HOST = PUBLIC_SHIPPING_HOST;
export { hostName, isShippingHost };

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

