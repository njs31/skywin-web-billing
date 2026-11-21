import { NextRequest } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldIdentity, isReviewPhone } from "@/lib/field-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

/**
 * A signed-in farmer deletes their own account (App Store 5.1.1(v), Google Play account deletion).
 * The farmer record is anonymised rather than removed, because GST invoices must keep pointing
 * at a customer; the name, phone, address, photo and farm details are erased, and the name
 * on their past invoices is replaced.
 */
export async function POST(req: NextRequest) {
  const who = fieldIdentity(req);
  if (!who) return fieldJson({ error: "Sign in again to delete your account." }, 401);
  if (who.role !== "farmer") {
    return fieldJson({ error: "Staff accounts are removed by an admin." }, 403);
  }
  if (isReviewPhone(who.phone)) return fieldJson({ ok: true, deleted: 0 });

  const matches = await db
    .select({ id: customers.id })
    .from(customers)
    .where(sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) = ${who.phone}`);
  const ids = matches.map((m) => m.id);
  if (!ids.length) return fieldJson({ ok: true, deleted: 0 });

  await db.transaction(async (tx) => {
    await tx
      .update(customers)
      .set({
        name: "Deleted farmer",
        phone: null,
        altPhone: null,
        address: null,
        village: null,
        taluk: null,
        district: null,
        pinCode: null,
        acre: null,
        crop: null,
        photoUrl: null,
        membershipNo: null,
        fieldExternalId: null,
        assignedOfficerId: null,
        fieldOfficerName: null,
        rewardPoints: 0,
        approval: "deleted",
      })
      .where(inArray(customers.id, ids));
    for (const id of ids) {
      await tx.update(sales).set({ customerName: "Deleted farmer" }).where(eq(sales.customerId, id));
    }
  });
  console.info("[field/account/delete] anonymised farmer", { customers: ids.length });
  return fieldJson({ ok: true, deleted: ids.length });
}
