import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldAppUserByPhone, fieldOfficerSeesOwnFarmers } from "@/lib/field-officer-scope";
import {
  getFieldFarmer,
  listFieldFarmers,
  normalizePaymentMode,
  upsertFieldFarmer,
} from "@/lib/queries/field-farmers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A signed-in sales officer is limited to farmers assigned to that officer. */
async function salesOfficerScope(phone: string) {
  if (!phone.trim()) return { officerId: undefined as number | undefined, officerName: undefined as string | undefined, blocked: false };
  const viewer = await fieldAppUserByPhone(phone);
  if (!viewer) return { officerId: undefined, officerName: undefined, blocked: true };
  if (!fieldOfficerSeesOwnFarmers(viewer.role)) {
    return { officerId: undefined, officerName: undefined, blocked: false };
  }
  return { officerId: viewer.id, officerName: viewer.name, blocked: false };
}

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id") || "");
  const phone = url.searchParams.get("phone") || undefined;
  const q = url.searchParams.get("q") || undefined;
  const viewerPhone = url.searchParams.get("viewer") || "";
  try {
    const scope = await salesOfficerScope(viewerPhone);
    if (scope.blocked) return fieldJson({ farmers: [] });
    if (Number.isFinite(id) && id > 0) {
      const farmer = await getFieldFarmer(id, scope.officerId);
      return fieldJson({ farmer });
    }
    const farmers = await listFieldFarmers({
      q: q || phone,
      approval: "all",
      officerId: scope.officerId,
    });
    return fieldJson({ farmers });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Farmers failed" }, 500);
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }
  try {
    const body = (await req.json()) as {
      id?: number;
      name?: string;
      phone?: string;
      altPhone?: string;
      village?: string;
      address?: string;
      pin?: string;
      pinCode?: string;
      language?: "en" | "ta";
      assignedOfficerId?: number | null;
      assignedOfficerPhone?: string;
      paymentMode?: string;
      photo?: string;
      photoUrl?: string;
      viewerPhone?: string;
      farms?: Array<{
        id?: number;
        name?: string;
        crop?: string;
        acres?: number;
        gps?: string;
        address?: string;
        pin?: string;
        validated?: boolean;
      }>;
    };
    if (!body.name?.trim()) {
      return fieldJson({ error: "name is required" }, 400);
    }
    const scope = await salesOfficerScope(String(body.viewerPhone || ""));
    if (scope.blocked) return fieldJson({ error: "Farmer not found" }, 404);
    if (scope.officerId) {
      if (body.id) {
        const existing = await getFieldFarmer(body.id, scope.officerId);
        if (!existing) return fieldJson({ error: "Farmer not found" }, 404);
      }
      body.assignedOfficerId = scope.officerId;
      body.assignedOfficerPhone = undefined;
    }
    const farmer = await upsertFieldFarmer(
      {
        name: body.name,
        phone: body.phone,
        altPhone: body.altPhone,
        village: body.village,
        address: body.address,
        pinCode: body.pinCode || body.pin,
        language: body.language,
        source: body.id ? undefined : "registered",
        assignedOfficerId: body.assignedOfficerId,
        assignedOfficerPhone: body.assignedOfficerPhone,
        ...(scope.officerName ? { fieldOfficerName: scope.officerName } : {}),
        paymentMode: normalizePaymentMode(body.paymentMode),
        photoUrl: body.photoUrl || body.photo,
        farms: (body.farms ?? []).map((farm) => ({
          id: farm.id,
          name: farm.name || "Main field",
          crop: farm.crop,
          acres: farm.acres,
          gps: farm.gps,
          address: farm.address,
          pin: farm.pin,
          validated: farm.validated,
        })),
      },
      body.id
    );
    return fieldJson({ farmer });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not save farmer" }, 500);
  }
}
