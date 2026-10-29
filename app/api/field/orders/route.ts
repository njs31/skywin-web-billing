import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { listFieldOrders, placeFieldOrder } from "@/lib/queries/field-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fieldOrderErrorMessage(err: unknown) {
  let current: unknown = err;
  let last = err instanceof Error ? err.message : "Failed to place field order";
  for (let i = 0; current && i < 8; i++) {
    const e = current as {
      message?: string;
      code?: string;
      detail?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (e.code && /^\d{5}$/.test(String(e.code))) {
      return [e.code, e.constraint, e.detail || e.message].filter(Boolean).join(" · ");
    }
    if (e.detail) last = e.detail;
    else if (e.message && !e.message.startsWith("Failed query")) last = e.message;
    current = e.cause;
  }
  return last;
}

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }
  try {
    const data = await listFieldOrders();
    return fieldJson(data);
  } catch (err) {
    return fieldJson(
      { error: err instanceof Error ? err.message : "Failed to list field orders" },
      500
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const result = await placeFieldOrder({
      orderId: String(body.orderId || body.id || ""),
      farmerName: String(body.farmerName || body.farmer || ""),
      farmerPhone: String(body.farmerPhone || body.phone || ""),
      officerName: String(body.officerName || body.officer || ""),
      deliveryDate: body.deliveryDate ? String(body.deliveryDate) : undefined,
      note: body.note ? String(body.note) : undefined,
      placedGps: body.placedGps ? String(body.placedGps) : undefined,
      paidAmount: Number(body.paidAmount ?? body.total) || 0,
      razorpayPaymentId: body.razorpayPaymentId ? String(body.razorpayPaymentId) : undefined,
      razorpayOrderId: body.razorpayOrderId ? String(body.razorpayOrderId) : undefined,
      items: items.map((item: Record<string, unknown>) => ({
        productId: Number(item.productId),
        batchId: item.batchId == null || item.batchId === "" ? null : Number(item.batchId),
        qty: Number(item.qty) || 1,
        rate: item.rate != null ? Number(item.rate) : undefined,
        gstRate: item.gstRate != null ? Number(item.gstRate) : undefined,
      })),
    });
    return fieldJson(result);
  } catch (err) {
    const msg = fieldOrderErrorMessage(err);
    console.error("[field/orders]", msg);
    const unavailable = /out of stock|insufficient qty|does not belong to this product|requested quantity exceeds/i.test(msg);
    return fieldJson(
      {
        success: false,
        error: unavailable
          ? "This batch is no longer available. Search again."
          : msg,
      },
      unavailable ? 409 : 400
    );
  }
}
