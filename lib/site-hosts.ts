/**
 * Public hostnames of the three sites served by this app. Client-safe (no secrets).
 * The field and shipping sites moved to shorter names; the old names keep working
 * exactly the same during the switch (installed apps, bookmarks and signed-in browsers).
 * Both names of each site are treated identically.
 */
export const BILLING_HOST = "skywin.qwicksapp.com";
export const FIELD_HOSTS = ["field.qwicksapp.com", "skywin-field.qwicksapp.com"] as const;
export const SHIPPING_HOSTS = ["ship.qwicksapp.com", "shipping.qwicksapp.com"] as const;

/**
 * Names used in links, redirects and on-screen text. They stay on the old names until
 * field.qwicksapp.com / ship.qwicksapp.com resolve and have certificates; then switch
 * these two lines to FIELD_HOSTS[0] / SHIPPING_HOSTS[0] and redeploy.
 */
export const PUBLIC_FIELD_HOST: string = "skywin-field.qwicksapp.com";
export const PUBLIC_SHIPPING_HOST: string = "shipping.qwicksapp.com";

export const BILLING_ORIGIN = `https://${BILLING_HOST}`;
export const FIELD_ORIGIN = `https://${PUBLIC_FIELD_HOST}`;
export const SHIPPING_ORIGIN = `https://${PUBLIC_SHIPPING_HOST}`;

/** Host from x-forwarded-host / host, lower-case, without port. */
export function hostName(raw: string | null | undefined): string {
  return String(raw ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
}

export function isFieldHost(raw: string | null | undefined): boolean {
  return (FIELD_HOSTS as readonly string[]).includes(hostName(raw));
}

export function isShippingHost(raw: string | null | undefined): boolean {
  return (SHIPPING_HOSTS as readonly string[]).includes(hostName(raw));
}
