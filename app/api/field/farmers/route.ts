import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldIdentity } from "@/lib/field-auth";
import { notifyLater, officerPhoneForCustomer, pushCopy } from "@/lib/field-push";
import { fieldAppUserByPhone, fieldOfficerSeesOwnFarmers } from "@/lib/field-officer-scope";
import {
  assignmentForFarmerPin,
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
  const who = fieldIdentity(req);
  // A signed-in farmer only ever sees their own record.
  const phone = who?.role === "farmer" ? who.phone : url.searchParams.get("phone") || undefined;
  const q = who?.role === "farmer" ? undefined : url.searchParams.get("q") || undefined;
  const viewerPhone = who && who.role !== "farmer" ? who.phone : url.searchParams.get("viewer") || "";
  const ownPhone = (value: string | null | undefined) =>
    String(value || "").replace(/\D/g, "").slice(-10) === who?.phone;
  try {
    const scope = await salesOfficerScope(viewerPhone);
    if (scope.blocked) return fieldJson({ farmers: [] });
    if (Number.isFinite(id) && id > 0) {
      const farmer = await getFieldFarmer(id, scope.officerId);
      if (who?.role === "farmer" && farmer && !ownPhone(farmer.phone)) return fieldJson({ farmer: null });
      return fieldJson({ farmer });
    }
    const listed = await listFieldFarmers({
      q: q || phone,
      approval: "all",
      officerId: scope.officerId,
    });
    const farmers = who?.role === "farmer" ? listed.filter((f) => ownPhone(f.phone)) : listed;
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
    const who = fieldIdentity(req);
    if (who?.role === "farmer") {
      // Farmers edit only their own profile.
      body.phone = who.phone;
      if (body.id) {
        const existing = await getFieldFarmer(body.id, undefined);
        if (existing && String(existing.phone || "").replace(/\D/g, "").slice(-10) !== who.phone) {
          return fieldJson({ error: "Farmer not found" }, 404);
        }
      }
    }
    const scope = await salesOfficerScope(who && who.role !== "farmer" ? who.phone : String(body.viewerPhone || ""));
    if (scope.blocked) return fieldJson({ error: "Farmer not found" }, 404);
    let pinOfficerName: string | undefined;
    if (scope.officerId) {
      if (body.id) {
        const existing = await getFieldFarmer(body.id, scope.officerId);
        if (!existing) return fieldJson({ error: "Farmer not found" }, 404);
      }
      body.assignedOfficerId = scope.officerId;
      body.assignedOfficerPhone = undefined;
    } else {
      const assignment = await assignmentForFarmerPin({
        id: body.id,
        phone: body.phone,
        pin: body.pinCode || body.pin,
        address: body.address,
        village: body.village,
      });
      if (assignment) {
        body.assignedOfficerId = assignment.assignedOfficerId;
        body.assignedOfficerPhone = undefined;
        pinOfficerName = assignment.fieldOfficerName;
      }
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
        ...(pinOfficerName
          ? { fieldOfficerName: pinOfficerName }
          : scope.officerName
            ? { fieldOfficerName: scope.officerName }
            : {}),
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
    // A farmer who signs up in the app is introduced to the officer for their PIN area.
    if (who?.role === "farmer" && !body.id && pinOfficerName && farmer?.id) {
      const officerPhone = await officerPhoneForCustomer(Number(farmer.id));
      if (officerPhone) notifyLater([officerPhone], pushCopy.newFarmerForOfficer(farmer.name, farmer.village || "", Number(farmer.id)));
    }
    return fieldJson({ farmer });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Could not save farmer" }, 500);
  }
}
