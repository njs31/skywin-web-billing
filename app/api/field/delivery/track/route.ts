import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { trackDelhivery } from "@/lib/delivery/delhivery";
import { getOrderTrackingDetails } from "@/lib/services/shipping-checkpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const awb = req.nextUrl.searchParams.get("awb") || "";
    const orderId = req.nextUrl.searchParams.get("orderId") || "";

    const identifier = orderId || awb;

    // Check if we have tracking checkpoints recorded in our database
    try {
      const manualTrack = await getOrderTrackingDetails(identifier);
      if (manualTrack.history.length > 0) {
        return fieldJson({
          waybill: manualTrack.orderId,
          status: manualTrack.currentStatus,
          at: manualTrack.lastUpdated,
          instructions: "",
          origin: "SkyWin Kumbakonam",
          destination: manualTrack.location,
          courier: manualTrack.courier,
          checkpoints: manualTrack.history,
        });
      }
    } catch {
      // Ignore and proceed
    }

    // If AWB looks like a Delhivery waybill (typically 12-14 digits)
    if (/^\d{10,}$/.test(awb)) {
      return fieldJson(await trackDelhivery(awb));
    }

    // Default response if newly created
    return fieldJson({
      waybill: identifier,
      status: "Order Received",
      at: new Date().toISOString(),
      instructions: "Order received and confirmed.",
      origin: "SkyWin Kumbakonam",
      destination: "",
      courier: "SkyWin Delivery",
      checkpoints: [
        {
          id: 0,
          checkpoint: "Order Received",
          note: "Order confirmed",
          location: "Kumbakonam",
          createdAt: new Date().toISOString(),
        },
      ],
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Track failed" }, 400);
  }
}
