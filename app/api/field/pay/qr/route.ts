import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldIdentity, rateLimited, type FieldIdentity } from "@/lib/field-auth";
import { cancelPaymentLink, getPaymentLink, getRazorpayOrder, paidLinkPayment, paymentLinkNotes } from "@/lib/payments/razorpay";
import { upiQrOwnedBy } from "@/lib/field-upi-qr";
import { makeUpiQr } from "@/lib/field-upi-qr-make";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

type OrderNotes = Record<string, string>;

/**
 * Dynamic UPI QR for a field order, so the farmer pays by scanning the officer's screen.
 *
 * POST { razorpayOrderId, replaceLinkId? } → { linkId, upi, expiresAt }
 *   (A new QR for an order already started. The first QR usually comes with /pay/create.)
 *   Makes a UPI payment link for exactly the Razorpay order's amount, carrying the order's
 *   notes (cart, farmer, delivery) plus `rzpOrder`, so the sale is saved with the same checks
 *   as an in-app payment. `replaceLinkId` cancels the QR it replaces.
 * GET ?link=plink_… → { status, paid, paymentId }   (the app polls this)
 * DELETE ?link=plink_… → cancels an unpaid QR (the officer paid another way or left).
 *
 * Only the signed-in person who started the payment can see or use its QR.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const who = fieldIdentity(req);
  if (!who) return fieldJson({ error: "Sign in again to show a UPI QR." }, 401);
  try {
    const body = (await req.json()) as { razorpayOrderId?: string; replaceLinkId?: string };
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

    if (body.replaceLinkId) await cancelOwnLink(String(body.replaceLinkId), who).catch(() => undefined);

    const made = await makeUpiQr({ amountPaise, fieldOrder, notes: { ...notes, rzpOrder: razorpayOrderId } });
    return fieldJson({ linkId: made.linkId, upi: made.upi, amount: amountPaise, expiresAt: made.expiresAt });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not make the UPI QR." }, 400);
  }
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const who = fieldIdentity(req);
  if (!who) return fieldJson({ error: "Unauthorized" }, 401);
  const linkId = req.nextUrl.searchParams.get("link") || "";
  if (!/^plink_[A-Za-z0-9]+$/.test(linkId)) return fieldJson({ error: "Invalid QR." }, 400);
  try {
    const link = await getPaymentLink(linkId);
    if (!upiQrOwnedBy(paymentLinkNotes(link), who)) return fieldJson({ error: "Invalid QR." }, 403);
    const payment = paidLinkPayment(link);
    return fieldJson({
      status: link.status || "",
      paid: !!payment,
      paymentId: payment?.payment_id ?? null,
      razorpayOrderId: paymentLinkNotes(link).rzpOrder || null,
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not check the payment." }, 400);
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const who = fieldIdentity(req);
  if (!who) return fieldJson({ error: "Unauthorized" }, 401);
  const linkId = req.nextUrl.searchParams.get("link") || "";
  if (!/^plink_[A-Za-z0-9]+$/.test(linkId)) return fieldJson({ error: "Invalid QR." }, 400);
  try {
    const result = await cancelOwnLink(linkId, who);
    return fieldJson(result);
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not close the QR." }, 400);
  }
}

/** Cancels the caller's own unpaid QR. A paid one is left alone and reported. */
async function cancelOwnLink(linkId: string, who: FieldIdentity) {
  const link = await getPaymentLink(linkId);
  if (!upiQrOwnedBy(paymentLinkNotes(link), who)) throw new Error("Invalid QR.");
  const payment = paidLinkPayment(link);
  if (payment) return { cancelled: false, paid: true, paymentId: payment.payment_id ?? null };
  if (link.status === "cancelled" || link.status === "expired") return { cancelled: true, paid: false, paymentId: null };
  await cancelPaymentLink(linkId);
  return { cancelled: true, paid: false, paymentId: null };
}
