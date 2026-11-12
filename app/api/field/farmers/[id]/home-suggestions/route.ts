import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldAppUserByPhone, fieldOfficerSeesOwnFarmers } from "@/lib/field-officer-scope";
import { homeSuggestionsForFarmer } from "@/lib/queries/home-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const none = { source: null, items: [] };

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  const { id } = await params;
  const farmerId = Number(id);
  if (!Number.isInteger(farmerId) || farmerId <= 0) return fieldJson(none);
  try {
    const viewerPhone = req.nextUrl.searchParams.get("viewer") || "";
    if (viewerPhone.trim()) {
      const viewer = await fieldAppUserByPhone(viewerPhone);
      if (!viewer) return fieldJson(none);
      if (fieldOfficerSeesOwnFarmers(viewer.role)) {
        const [farmer] = await db
          .select({ assignedOfficerId: customers.assignedOfficerId })
          .from(customers)
          .where(eq(customers.id, farmerId))
          .limit(1);
        if (!farmer || farmer.assignedOfficerId !== viewer.id) return fieldJson(none);
      }
    }
    const result = await homeSuggestionsForFarmer(farmerId);
    return fieldJson(result);
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Suggestions failed" }, 500);
  }
}
