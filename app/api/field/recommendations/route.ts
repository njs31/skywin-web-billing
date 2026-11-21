import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldIdentity } from "@/lib/field-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { RecommendationError } from "@/lib/field-recommendation-access";
import {
  appOfficerMayRead,
  deleteFieldRecommendation,
  farmerIdsByPhone,
  fieldOfficerByPhone,
  listRecommendationsForAppOfficer,
  listRecommendationsForFarmer,
  saveFieldRecommendation,
} from "@/lib/queries/field-recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

/** Our own validation messages go to the app; database and other errors are logged, not returned. */
function failure(err: unknown, fallback: string) {
  if (err instanceof RecommendationError) return fieldJson({ error: err.message }, err.status);
  console.error("[api/field/recommendations]", err);
  return fieldJson({ error: fallback }, 500);
}

/**
 * GET ?phone=<signed-in app phone>&farmerId=<farmer>
 * - A field officer gets the farmer's rows only if the farmer is assigned to him
 *   (admins and other office roles in the app may read any farmer).
 * - A farmer gets only their own rows; another farmer's id returns nothing.
 * Without farmerId (older app builds) an officer gets his farmers' rows and a farmer their own.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const who = fieldIdentity(req);
    const phone = who ? who.phone : req.nextUrl.searchParams.get("phone") || "";
    const rawFarmer = req.nextUrl.searchParams.get("farmerId");
    const farmerId = rawFarmer ? Number(rawFarmer) : null;
    if (farmerId !== null && (!Number.isInteger(farmerId) || farmerId <= 0)) {
      return fieldJson({ recommendations: [] });
    }

    // A signed-in farmer is never treated as an officer, even if the number is also staff.
    const officer = who?.role === "farmer" ? null : await fieldOfficerByPhone(phone);
    if (officer) {
      if (farmerId === null) return fieldJson({ recommendations: await listRecommendationsForAppOfficer(officer) });
      if (!(await appOfficerMayRead(officer, farmerId))) return fieldJson({ recommendations: [] });
      return fieldJson({ recommendations: await listRecommendationsForFarmer(farmerId, officer.id) });
    }

    const ownIds = await farmerIdsByPhone(phone);
    if (ownIds.length === 0) return fieldJson({ recommendations: [] });
    if (farmerId !== null && !ownIds.includes(farmerId)) return fieldJson({ recommendations: [] });
    const ids = farmerId !== null ? [farmerId] : ownIds;
    const lists = await Promise.all(ids.map((id) => listRecommendationsForFarmer(id, null)));
    return fieldJson({ recommendations: lists.flat() });
  } catch (err) {
    return failure(err, "Could not load recommendations.");
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json().catch(() => ({}))) as {
      phone?: string;
      id?: number;
      farmerId?: number;
      remove?: boolean;
      crop?: string;
      stage?: string;
      problem?: string;
      note?: string;
      productIds?: number[];
    };
    const who = fieldIdentity(req);
    const officer = await fieldOfficerByPhone(who ? who.phone : body.phone || "");
    if (!officer) {
      return fieldJson({ error: "Only a field officer can save a recommendation." }, 403);
    }
    const id = Number(body.id);
    if (body.remove) {
      if (!Number.isInteger(id) || id <= 0) return fieldJson({ error: "Recommendation not found." }, 400);
      await deleteFieldRecommendation(id, officer);
      return fieldJson({ ok: true });
    }
    const recommendation = await saveFieldRecommendation(
      {
        id: Number.isInteger(id) && id > 0 ? id : undefined,
        farmerId: Number(body.farmerId),
        crop: body.crop || "",
        stage: body.stage || "",
        problem: body.problem || "",
        note: body.note || "",
        productIds: Array.isArray(body.productIds) ? body.productIds.map(Number) : [],
      },
      officer
    );
    return fieldJson({ recommendation });
  } catch (err) {
    return failure(err, "Could not save recommendation.");
  }
}
