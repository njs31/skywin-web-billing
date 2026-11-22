/**
 * Farmer account deletion for the Field app (App Store 5.1.1(v), Google Play account deletion).
 *
 * The farmer asks in the app; that only files a request. An admin approves it on
 * /field/deletions, and only then is the record anonymised. The farmer record is anonymised
 * rather than removed, because GST invoices must keep pointing at a customer; the name,
 * phone, address, photo and farm details are erased and the name on past invoices replaced.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, fieldDeletionRequests, pushTokens, sales } from "@/db/schema";

function farmersByPhone(phone: string) {
  return db
    .select({ id: customers.id, name: customers.name, village: customers.village })
    .from(customers)
    .where(sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) = ${phone}`);
}

export async function pendingDeletionRequest(phone: string) {
  const [open] = await db
    .select()
    .from(fieldDeletionRequests)
    .where(and(eq(fieldDeletionRequests.phone, phone), eq(fieldDeletionRequests.status, "pending")))
    .limit(1);
  return open ?? null;
}

/** Files (or returns the already open) deletion request for this phone. */
export async function requestFarmerDeletion(phone: string) {
  const open = await pendingDeletionRequest(phone);
  if (open) return { request: open, created: false };
  const matches = await farmersByPhone(phone);
  const [request] = await db
    .insert(fieldDeletionRequests)
    .values({
      phone,
      name: matches[0]?.name ?? null,
      village: matches[0]?.village ?? null,
      customerIds: matches.map((m) => m.id),
    })
    .returning();
  return { request: request!, created: true };
}

export async function listDeletionRequests() {
  return db.select().from(fieldDeletionRequests).orderBy(desc(fieldDeletionRequests.requestedAt)).limit(200);
}

/** Erases the farmer's personal details. Returns how many farmer records were anonymised. */
async function anonymiseFarmer(phone: string, knownIds: number[]) {
  const ids = [...new Set([...knownIds, ...(await farmersByPhone(phone)).map((m) => m.id)])];
  await db.transaction(async (tx) => {
    if (ids.length) {
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
      await tx.update(sales).set({ customerName: "Deleted farmer" }).where(inArray(sales.customerId, ids));
    }
    // Stop pushes to the phone that asked.
    await tx.delete(pushTokens).where(eq(pushTokens.phone, phone));
  });
  return ids.length;
}

/** Admin decision. "delete" anonymises the farmer; "reject" closes the request untouched. */
export async function decideDeletionRequest(id: number, decision: "delete" | "reject", adminName: string) {
  const [request] = await db.select().from(fieldDeletionRequests).where(eq(fieldDeletionRequests.id, id)).limit(1);
  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") throw new Error("This request has already been handled.");
  const deleted = decision === "delete" ? await anonymiseFarmer(request.phone, request.customerIds ?? []) : 0;
  await db
    .update(fieldDeletionRequests)
    .set({ status: decision === "delete" ? "deleted" : "rejected", decidedAt: new Date(), decidedBy: adminName })
    .where(eq(fieldDeletionRequests.id, id));
  return { deleted, request };
}
