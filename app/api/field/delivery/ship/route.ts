import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { createDelhiveryShipment } from "@/lib/delivery/delhivery";

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
    const ship = await createDelhiveryShipment({
      orderId: String(body.orderId || ""),
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
    return fieldJson(ship);
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not book shipment" }, 400);
  }
}
