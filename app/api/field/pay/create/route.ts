import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { createRazorpayOrder } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as {
      amount?: number;
      orderId?: string;
      farmerName?: string;
      farmerPhone?: string;
    };
    const rupees = Number(body.amount);
    const receipt = String(body.orderId || `SW-${Date.now()}`).slice(0, 40);
    const order = await createRazorpayOrder({
      amountPaise: Math.round(rupees * 100),
      receipt,
      notes: {
        fieldOrder: receipt,
        farmer: String(body.farmerName || ""),
        phone: String(body.farmerPhone || ""),
      },
    });
    return fieldJson({
      keyId: order.keyId,
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt,
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not start payment" }, 400);
  }
}
