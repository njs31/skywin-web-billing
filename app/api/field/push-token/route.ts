import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { registerPushToken } from "@/lib/services/shipping-checkpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as { phone?: string; token?: string; platform?: string };
    const phone = String(body.phone || "");
    const token = String(body.token || "");
    const platform = String(body.platform || "android");

    if (!phone || !token) {
      return fieldJson({ error: "phone and token are required" }, 400);
    }

    const res = await registerPushToken(phone, token, platform);
    return fieldJson(res);
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Failed to save push token" }, 400);
  }
}
