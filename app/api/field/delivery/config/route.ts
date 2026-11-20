import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { getShippingProvider, setShippingProvider, type ShippingProviderMode } from "@/lib/delivery/manual-rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const provider = await getShippingProvider();
    return fieldJson({
      provider,
      name: provider === "manual" ? "SkyWin Delivery" : "Delhivery",
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Failed to get config" }, 500);
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as { provider?: ShippingProviderMode; updatedBy?: string };
    const mode = body.provider === "delhivery" ? "delhivery" : "manual";
    const result = await setShippingProvider(mode, body.updatedBy || "API");
    return fieldJson(result);
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Failed to update config" }, 400);
  }
}
