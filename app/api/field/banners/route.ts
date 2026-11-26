import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { appFieldBanners } from "@/lib/queries/field-banners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

/** Shown carousel banners for the app: Products page ("products") and category pages ("category" + slug). */
export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }
  try {
    return fieldJson({ banners: await appFieldBanners() });
  } catch (err) {
    console.warn("[field/banners]", err instanceof Error ? err.message : err);
    return fieldJson({ error: "Banners failed" }, 500);
  }
}
