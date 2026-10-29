import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { quoteDelhivery } from "@/lib/delivery/delhivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const pin = req.nextUrl.searchParams.get("pin") || "";
    const kg = Number(req.nextUrl.searchParams.get("kg") || 1);
    const grams = Math.max(100, Math.round((Number.isFinite(kg) ? kg : 1) * 1000));
    return fieldJson(await quoteDelhivery(pin, grams));
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Quote failed" }, 400);
  }
}
