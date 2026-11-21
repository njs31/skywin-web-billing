import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { cleanMobile, fieldIdentity, legacyFieldKeyAllowed } from "@/lib/field-auth";
import { packCart, priceFieldLines, rewardPointsFor, type FieldLineIn } from "@/lib/field-order-pricing";
import { createRazorpayOrder } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

/**
 * Starts a Razorpay payment for a field order.
 * With `items`, the server prices the cart and refuses an amount below what the goods cost
 * (less the farmer's reward points). The cart is saved on the Razorpay order so the webhook
 * can still create the sale if the phone never comes back.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const who = fieldIdentity(req);
  try {
    const body = (await req.json()) as {
      amount?: number;
      orderId?: string;
      farmerName?: string;
      farmerPhone?: string;
      items?: FieldLineIn[];
    };
    const rupees = Number(body.amount);
    if (!Number.isFinite(rupees) || rupees < 1) return fieldJson({ error: "Invalid amount" }, 400);
    const receipt = String(body.orderId || `SW-${Date.now()}`).slice(0, 40);
    const farmerPhone = who?.role === "farmer" ? who.phone : cleanMobile(body.farmerPhone);
    const items = Array.isArray(body.items) ? body.items : [];

    let cart: string | null = null;
    if (items.length) {
      const priced = await priceFieldLines(items);
      const rewards = Math.min(await rewardPointsFor(farmerPhone), priced.minimumTotal);
      const minimum = Math.max(1, priced.minimumTotal - rewards);
      if (rupees + 1 < minimum) {
        return fieldJson({ error: "The amount is less than the order total. Refresh the cart and try again." }, 400);
      }
      cart = packCart(priced.lines);
    } else if (who || !legacyFieldKeyAllowed()) {
      // Signed-in apps always send the cart; only old builds may omit it.
      return fieldJson({ error: "Cart items are required." }, 400);
    }

    const order = await createRazorpayOrder({
      amountPaise: Math.round(rupees * 100),
      receipt,
      notes: {
        fieldOrder: receipt,
        farmer: String(body.farmerName || "").slice(0, 120),
        phone: farmerPhone,
        ...(who && who.role !== "farmer" ? { officerPhone: who.phone } : {}),
        ...(cart ? { cart } : {}),
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
