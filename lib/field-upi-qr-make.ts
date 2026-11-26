import { createUpiQrCode } from "@/lib/payments/razorpay";
import { upiQrExpiry } from "@/lib/field-upi-qr";
import { qrSquareFromRazorpayImage } from "@/lib/field-upi-qr-image";

/**
 * Makes the UPI QR for a field order with Razorpay's QR Codes API: a single-use QR for
 * exactly `amountPaise`, carrying the order's notes (cart, farmer, officer, delivery charge).
 * Razorpay gives back an image URL; the server downloads it once and sends the phone just the
 * code (see qrSquareFromRazorpayImage). `timings` says where the time went.
 */
export async function makeUpiQr(input: { amountPaise: number; fieldOrder: string; notes: Record<string, string> }) {
  const started = Date.now();
  const qr = await createUpiQrCode({
    amountPaise: input.amountPaise,
    name: "SkyWin",
    description: `SkyWin field order ${input.fieldOrder}`,
    closeBy: upiQrExpiry(Date.now()),
    notes: input.notes,
  });
  const createMs = Date.now() - started;
  const res = await fetch(String(qr.image_url), { redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("Razorpay did not send the QR image.");
  const image = await qrSquareFromRazorpayImage(Buffer.from(await res.arrayBuffer()));
  const closeBy = Number(qr.close_by);
  return {
    qrId: qr.id,
    image: `data:image/png;base64,${image.png.toString("base64")}`,
    expiresAt: new Date((Number.isFinite(closeBy) ? closeBy : upiQrExpiry(Date.now())) * 1000).toISOString(),
    timings: { createMs, imageMs: Date.now() - started - createMs, imageBytes: image.png.length, cropped: image.cropped },
  };
}
