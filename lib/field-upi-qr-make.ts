import { createUpiPaymentLink, upiIntentForLink } from "@/lib/payments/razorpay";
import { upiQrExpiry } from "@/lib/field-upi-qr";

/**
 * Makes the UPI QR for a field order: a Razorpay UPI payment link for exactly `amountPaise`,
 * carrying the order's notes (cart, farmer, officer, delivery charge), then the `upi://pay?…`
 * request it resolves to. `timings` says where the time went (Razorpay's redirect page is
 * usually the slow part, about 1.2 s).
 */
export async function makeUpiQr(input: { amountPaise: number; fieldOrder: string; notes: Record<string, string> }) {
  const started = Date.now();
  const link = await createUpiPaymentLink({
    amountPaise: input.amountPaise,
    referenceId: `${input.fieldOrder}-${Date.now().toString(36)}`,
    description: `SkyWin field order ${input.fieldOrder}`,
    expireBy: upiQrExpiry(Date.now()),
    notes: input.notes,
  });
  const linkMs = Date.now() - started;
  const upi = await upiIntentForLink(String(link.short_url || ""));
  return {
    linkId: link.id,
    upi,
    expiresAt: new Date(Number(link.expire_by) * 1000).toISOString(),
    timings: { linkMs, resolveMs: Date.now() - started - linkMs },
  };
}
