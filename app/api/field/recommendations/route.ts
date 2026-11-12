import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import {
  deleteFieldRecommendation,
  fieldOfficerByPhone,
  listFieldRecommendations,
  saveFieldRecommendation,
} from "@/lib/queries/field-recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const phone = req.nextUrl.searchParams.get("phone") || "";
    const recommendations = await listFieldRecommendations(phone);
    return fieldJson({ recommendations });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Recommendations failed" }, 500);
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const body = (await req.json()) as {
      phone?: string;
      id?: number;
      remove?: boolean;
      crop?: string;
      stage?: string;
      problem?: string;
      note?: string;
      productIds?: number[];
    };
    const officer = await fieldOfficerByPhone(body.phone || "");
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
    const message = err instanceof Error ? err.message : "Could not save recommendation";
    const status = /not found/i.test(message) ? 404 : 400;
    return fieldJson({ error: message }, status);
  }
}
