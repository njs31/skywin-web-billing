import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };
    const orderId = String(body.razorpay_order_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");
    if (!orderId || !paymentId || !signature) {
      return fieldJson({ ok: false, error: "Missing payment details" }, 400);
    }
    const ok = verifyRazorpaySignature({ orderId, paymentId, signature });
    if (!ok) return fieldJson({ ok: false, error: "Payment signature did not match." }, 400);
    return fieldJson({ ok: true, razorpayOrderId: orderId, razorpayPaymentId: paymentId });
  } catch (err) {
    return fieldJson({ ok: false, error: err instanceof Error ? err.message : "Verify failed" }, 400);
  }
}
