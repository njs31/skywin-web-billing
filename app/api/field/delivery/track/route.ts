import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { trackDelhivery } from "@/lib/delivery/delhivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const awb = req.nextUrl.searchParams.get("awb") || "";
    return fieldJson(await trackDelhivery(awb));
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Track failed" }, 400);
  }
}
