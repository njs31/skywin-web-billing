import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { checkDelhiveryPincode } from "@/lib/delivery/delhivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const pin = req.nextUrl.searchParams.get("pin") || "";
    return fieldJson(await checkDelhiveryPincode(pin));
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "PIN check failed" }, 400);
  }
}
