import { NextRequest } from "next/server";
import { pendingDeletionRequest, requestFarmerDeletion } from "@/lib/field-account-deletion";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldIdentity, isReviewPhone } from "@/lib/field-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

/**
 * A signed-in farmer asks to delete their account. This only files a request: an admin
 * approves it on /field/deletions, and only then are the farmer's details erased
 * (see lib/field-account-deletion.ts).
 */
export async function POST(req: NextRequest) {
  const who = fieldIdentity(req);
  if (!who) return fieldJson({ error: "Sign in again to delete your account." }, 401);
  if (who.role !== "farmer") {
    return fieldJson({ error: "Staff accounts are removed by an admin." }, 403);
  }
  if (isReviewPhone(who.phone)) return fieldJson({ ok: true, requested: true, status: "pending" });

  const { request, created } = await requestFarmerDeletion(who.phone);
  if (created) console.info("[field/account/delete] deletion requested", { request: request.id });
  return fieldJson({ ok: true, requested: true, status: request.status, requestedAt: request.requestedAt });
}

/** Whether this farmer already has a deletion request waiting for an admin. */
export async function GET(req: NextRequest) {
  const who = fieldIdentity(req);
  if (!who) return fieldJson({ error: "Unauthorized" }, 401);
  const pending = await pendingDeletionRequest(who.phone);
  return fieldJson({ pending: !!pending, requestedAt: pending?.requestedAt ?? null });
}
