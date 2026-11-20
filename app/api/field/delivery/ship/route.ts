import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { createDelhiveryShipment } from "@/lib/delivery/delhivery";
import { attachFieldWaybill } from "@/lib/queries/field-orders";
import { getShippingProvider } from "@/lib/delivery/manual-rates";
import { recordOrderCheckpoint } from "@/lib/services/shipping-checkpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as {
      orderId?: string;
      name?: string;
      phone?: string;
      address?: string;
      pin?: string;
      amount?: number;
      weightKg?: number;
      productsDesc?: string;
      hsn?: string;
      quantity?: number;
    };

    const orderId = String(body.orderId || "");
    const provider = await getShippingProvider();

    if (provider === "delhivery") {
      try {
        const ship = await createDelhiveryShipment({
          orderId,
          name: String(body.name || ""),
          phone: String(body.phone || ""),
          address: String(body.address || ""),
          pin: String(body.pin || ""),
          amount: Number(body.amount) || 0,
          weightGrams: Math.max(100, Math.round((Number(body.weightKg) || 1) * 1000)),
          productsDesc: String(body.productsDesc || ""),
          hsn: String(body.hsn || "3808"),
          quantity: Number(body.quantity) || 1,
        });
        await attachFieldWaybill(orderId, ship.waybill).catch(() => undefined);
        return fieldJson(ship);
      } catch (delhiveryErr) {
        console.warn("[delivery/ship] Delhivery booking failed, falling back to SkyWin Delivery:", delhiveryErr);
      }
    }

    // Manual Shipping method: record initial "Order Received" checkpoint
    const waybill = `SWD-${orderId}`;
    await recordOrderCheckpoint({
      orderId,
      checkpoint: "Order Received",
      note: `Delivery to ${body.address || "Farm"}, PIN ${body.pin || ""}`,
      location: body.pin || "Tamil Nadu",
      updatedBy: "System (App Checkout)",
    }).catch((err) => {
      console.error("[delivery/ship] failed to record initial checkpoint:", err);
    });

    await attachFieldWaybill(orderId, waybill).catch(() => undefined);

    return fieldJson({
      waybill,
      status: "Order Received",
      courier: "SkyWin Delivery" as const,
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not book shipment" }, 400);
  }
}
