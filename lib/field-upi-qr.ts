import type { FieldIdentity } from "@/lib/field-auth";

function tail(phone: string | undefined) {
  return String(phone ?? "").replace(/\D/g, "").slice(-10);
}

/**
 * Whether this signed-in person started the payment the QR is for: the officer who placed it
 * (notes.officerPhone), or the farmer paying for their own order (notes.phone, no officer).
 */
export function upiQrOwnedBy(notes: Record<string, string>, who: Pick<FieldIdentity, "phone" | "role">) {
  const me = tail(who.phone);
  if (me.length !== 10) return false;
  if (who.role === "farmer") return !notes.officerPhone && tail(notes.phone) === me;
  return tail(notes.officerPhone) === me;
}

/**
 * When the QR stops taking payments (Unix seconds): the QR Codes API's `close_by`. Just past the
 * 15-minute stock hold; the app stops showing it 30 s before the hold ends.
 */
export function upiQrExpiry(nowMs: number) {
  return Math.floor(nowMs / 1000) + 16 * 60;
}
