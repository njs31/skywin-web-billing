import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldIdentity, rateLimited, type FieldIdentity } from "@/lib/field-auth";
import { closeQrCode, getQrCode, getRazorpayOrder, paidQrCodePayment, qrCodeNotes } from "@/lib/payments/razorpay";
import { upiQrOwnedBy } from "@/lib/field-upi-qr";
import { makeUpiQr } from "@/lib/field-upi-qr-make";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

type OrderNotes = Record<string, string>;

/**
 * Dynamic UPI QR for a field officer's order (Razorpay QR Codes API), so the farmer pays by
 * scanning the officer's screen. Field officers only.
 *
 * POST { razorpayOrderId, replaceQrId? } → { qrId, image, amount, expiresAt }
 *   A new QR for an order already started (the first one usually comes with /pay/create).
 *   Single use, exactly the Razorpay order's amount, carrying the order's notes (cart, farmer,
 *   delivery) plus `rzpOrder`, so the sale is saved with the same checks as an in-app payment.
 *   `replaceQrId` closes the QR it replaces. `image` is a PNG data URL of just the code.
 * GET ?qr=qr_… → { status, paid, paymentId, razorpayOrderId }   (the app polls this)
 * DELETE ?qr=qr_… → closes an unpaid QR (the officer paid another way or left).
 *
 * Only the officer who started the payment can see or use its QR.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const who = officer(req);
  if (!who) return fieldJson({ error: "Sign in again to show a UPI QR." }, 401);
  try {
    const body = (await req.json()) as { razorpayOrderId?: string; replaceQrId?: string };
    const razorpayOrderId = String(body.razorpayOrderId || "");
    if (!/^order_[A-Za-z0-9]+$/.test(razorpayOrderId)) return fieldJson({ error: "Invalid payment." }, 400);
    if (rateLimited(`pay-qr:${who.phone}`, 30, 10 * 60 * 1000)) {
      return fieldJson({ error: "Too many QR codes. Wait a few minutes and try again." }, 429);
    }

    const order = (await getRazorpayOrder(razorpayOrderId)) as {
      amount?: number;
      amount_paid?: number;
      status?: string;
      notes?: OrderNotes | unknown[];
    };
    const notes = (order.notes && !Array.isArray(order.notes) ? order.notes : {}) as OrderNotes;
    if (!upiQrOwnedBy(notes, who)) return fieldJson({ error: "This payment belongs to someone else." }, 403);
    if (order.status === "paid" || Number(order.amount_paid) > 0) {
      return fieldJson({ error: "This order is already paid." }, 409);
    }
    const fieldOrder = String(notes.fieldOrder || "");
    const amountPaise = Number(order.amount);
    if (!fieldOrder || !Number.isFinite(amountPaise) || amountPaise < 100) {
      return fieldJson({ error: "Invalid payment." }, 400);
    }

    if (body.replaceQrId) {
      const old = await closeOwnQr(String(body.replaceQrId), who).catch(() => null);
      if (old?.paid) return fieldJson({ error: "This order is already paid.", paid: true, paymentId: old.paymentId }, 409);
    }

    const made = await makeUpiQr({ amountPaise, fieldOrder, notes: { ...notes, rzpOrder: razorpayOrderId } });
    return fieldJson({ qrId: made.qrId, image: made.image, amount: amountPaise, expiresAt: made.expiresAt });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not make the UPI QR." }, 400);
  }
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const who = officer(req);
  if (!who) return fieldJson({ error: "Unauthorized" }, 401);
  const qrId = qrParam(req);
  if (!qrId) return fieldJson({ error: "Invalid QR." }, 400);
  try {
    const qr = await getQrCode(qrId);
    const notes = qrCodeNotes(qr);
    if (!upiQrOwnedBy(notes, who)) return fieldJson({ error: "Invalid QR." }, 403);
    // Ask for the payment only once Razorpay has counted one; saves a call on every poll.
    const payment = Number(qr.payments_count_received) > 0 || qr.close_reason === "paid" ? await paidQrCodePayment(qrId) : null;
    return fieldJson({
      status: qr.status || "",
      paid: !!payment,
      paymentId: payment?.id ?? null,
      razorpayOrderId: notes.rzpOrder || null,
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not check the payment." }, 400);
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const who = officer(req);
  if (!who) return fieldJson({ error: "Unauthorized" }, 401);
  const qrId = qrParam(req);
  if (!qrId) return fieldJson({ error: "Invalid QR." }, 400);
  try {
    return fieldJson(await closeOwnQr(qrId, who));
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not close the QR." }, 400);
  }
}

/** The signed-in field officer or manager; farmers don't get a QR. */
function officer(req: NextRequest) {
  const who = fieldIdentity(req);
  return who && who.role !== "farmer" ? who : null;
}

function qrParam(req: NextRequest) {
  const qrId = req.nextUrl.searchParams.get("qr") || "";
  return /^qr_[A-Za-z0-9]+$/.test(qrId) ? qrId : "";
}

/** Closes the caller's own unpaid QR. A paid one is reported instead. */
async function closeOwnQr(qrId: string, who: FieldIdentity) {
  const qr = await getQrCode(qrId);
  if (!upiQrOwnedBy(qrCodeNotes(qr), who)) throw new Error("Invalid QR.");
  const before = await paidQrCodePayment(qrId);
  if (before?.id) return { closed: false, paid: true, paymentId: before.id };
  let closeError: unknown = null;
  if (qr.status !== "closed") await closeQrCode(qrId).catch((err) => (closeError = err));
  // A payment that landed while it was closing still counts (Razorpay refuses to close a paid QR).
  const after = await paidQrCodePayment(qrId);
  if (after?.id) return { closed: true, paid: true, paymentId: after.id };
  if (closeError && (await getQrCode(qrId)).status !== "closed") throw closeError;
  return { closed: true, paid: false, paymentId: null };
}
