import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { attachFieldWaybill } from "@/lib/queries/field-orders";
import { fieldOrderAccess } from "@/lib/field-order-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as { orderId?: string; waybill?: string };
    const access = await fieldOrderAccess(req, String(body.orderId || ""));
    if (!access.ok) return fieldJson({ error: access.error }, access.status);
    const waybill = String(body.waybill || "").trim();
    if (!/^[A-Za-z0-9-]{6,40}$/.test(waybill)) return fieldJson({ error: "Invalid waybill." }, 400);
    const saved = await attachFieldWaybill(String(body.orderId || ""), String(body.waybill || ""));
    if (!saved.ok) return fieldJson({ error: "That order has no invoice to attach." }, 404);
    return fieldJson({ ok: true });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not save tracking" }, 400);
  }
}
