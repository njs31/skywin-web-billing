import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldIdentity } from "@/lib/field-auth";
import { fieldStaffForLogin } from "@/lib/field-staff";
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
  // It changes what every customer pays, so only a signed-in admin or regional manager may.
  const who = fieldIdentity(req);
  if (!who || who.role !== "manager" || !(await fieldStaffForLogin(who.phone, "manager"))) {
    return fieldJson({ error: "Only a manager can change the delivery method." }, 403);
  }
  try {
    const body = (await req.json()) as { provider?: ShippingProviderMode; updatedBy?: string };
    const mode = body.provider === "delhivery" ? "delhivery" : "manual";
    const result = await setShippingProvider(mode, `Field app manager ${who.phone}`);
    return fieldJson(result);
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Failed to update config" }, 400);
  }
}
