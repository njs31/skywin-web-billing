/** Phone that signs in with REVIEWER_PASSWORD. Not the admin number. */
export const REVIEWER_PHONE = "9000000001";

/** SKUs the reviewer may search. Real catalog rows stay out of that session. */
export const DEMO_SKU_PREFIX = "DEMO-RP";

export function isReviewerPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").slice(-10) === REVIEWER_PHONE;
}

export function isDemoSku(sku: string | null | undefined): boolean {
  return (sku ?? "").startsWith(`${DEMO_SKU_PREFIX}-`) || (sku ?? "") === DEMO_SKU_PREFIX;
}
