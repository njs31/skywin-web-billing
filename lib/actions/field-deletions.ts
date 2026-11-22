"use server";

import { revalidatePath } from "next/cache";
import { requireFieldAdmin } from "@/lib/actions/auth";
import { decideDeletionRequest, listDeletionRequests } from "@/lib/field-account-deletion";
import { recordActivity } from "@/lib/queries/activity-logs";

export async function fieldDeletionRequests() {
  await requireFieldAdmin();
  return listDeletionRequests();
}

/** Admin approves ("delete") or turns down ("reject") a farmer's account deletion request. */
export async function decideFieldDeletion(id: number, decision: "delete" | "reject") {
  const user = await requireFieldAdmin();
  try {
    const { deleted, request } = await decideDeletionRequest(id, decision, user.name);
    await recordActivity({
      action: decision === "delete" ? "field.account.deleted" : "field.account.delete_rejected",
      message:
        decision === "delete"
          ? `Deleted Field app account of ${request.name || "farmer"} (${deleted} record${deleted === 1 ? "" : "s"} anonymised)`
          : `Turned down account deletion for ${request.name || "farmer"}`,
      entityType: "field_deletion_request",
      entityId: id,
      actor: { id: user.id, name: user.name },
    });
    revalidatePath("/field/deletions");
    revalidatePath("/field/farmers");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not update the request." };
  }
}
