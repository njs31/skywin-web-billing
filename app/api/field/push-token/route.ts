import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushTokens } from "@/db/schema";
import { fieldIdentity } from "@/lib/field-auth";
import { registerPushToken } from "@/lib/services/shipping-checkpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as { phone?: string; token?: string; platform?: string; remove?: boolean };
    const who = fieldIdentity(req);
    const phone = who ? who.phone : String(body.phone || "");
    const token = String(body.token || "");
    const platform = body.platform === "ios" ? "ios" : "android";

    if (body.remove && token) {
      await db.delete(pushTokens).where(eq(pushTokens.token, token));
      return fieldJson({ ok: true });
    }

    if (!phone || !token) {
      return fieldJson({ error: "phone and token are required" }, 400);
    }

    const res = await registerPushToken(phone, token, platform);
    return fieldJson(res);
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Failed to save push token" }, 400);
  }
}
