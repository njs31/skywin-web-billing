import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { customers, sales } from "@/db/schema";
import { fieldIdentity, isReviewPhone, type FieldIdentity } from "@/lib/field-auth";
import { fieldAppUserByPhone, fieldOfficerSeesOwnFarmers } from "@/lib/field-officer-scope";

const last10 = (value: string | null | undefined) => String(value ?? "").replace(/\D/g, "").slice(-10);

export type FieldOrderAccess =
  | { ok: true; who: FieldIdentity | null; sale: { id: number; notes: string | null; status: string | null } | null }
  | { ok: false; status: number; error: string };

/**
 * Whether the caller may act on this Field app order:
 *  - a farmer only on their own orders,
 *  - a sales officer only on orders of farmers assigned to them,
 *  - managers and office roles on any order.
 * Old builds with the shared app key (no login token) keep their old access while it is allowed;
 * `sale` is then null when the order is not billed yet.
 */
export async function fieldOrderAccess(req: NextRequest, orderId: string): Promise<FieldOrderAccess> {
  const id = orderId.trim();
  if (!id) return { ok: false, status: 400, error: "orderId is required" };
  const who = fieldIdentity(req);

  const [row] = await db
    .select({
      id: sales.id,
      notes: sales.notes,
      status: sales.status,
      phone: sql<string | null>`coalesce(${customers.phone}, '')`,
      assignedOfficerId: customers.assignedOfficerId,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(eq(sales.externalOrderId, id))
    .limit(1);

  if (!who) return { ok: true, who: null, sale: row ? { id: row.id, notes: row.notes, status: row.status } : null };
  if (!row) return { ok: false, status: 404, error: "Order not found." };

  if (who.role === "farmer") {
    if (last10(row.phone) !== who.phone) return { ok: false, status: 404, error: "Order not found." };
  } else {
    const viewer = await fieldAppUserByPhone(who.phone);
    if (!viewer) return { ok: false, status: 403, error: "Your field app access was removed. Contact the office." };
    if (fieldOfficerSeesOwnFarmers(viewer.role) && row.assignedOfficerId !== viewer.id) {
      return { ok: false, status: 404, error: "Order not found." };
    }
  }
  return { ok: true, who, sale: { id: row.id, notes: row.notes, status: row.status } };
}

/** The field officer a farmer (by phone) is assigned to, if any. */
export async function farmerAssignment(phone: string) {
  const mobile = last10(phone);
  if (mobile.length !== 10) return null;
  const [row] = await db
    .select({ id: customers.id, assignedOfficerId: customers.assignedOfficerId })
    .from(customers)
    .where(sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) = ${mobile}`)
    .limit(1);
  return row ?? null;
}

/**
 * A sales officer may only act for farmers who are theirs or not assigned yet.
 * Returns an error message when the farmer belongs to another officer.
 */
export async function officerMayServeFarmer(who: FieldIdentity | null, farmerPhone: string): Promise<string | null> {
  if (!who || who.role === "farmer") return null;
  const viewer = await fieldAppUserByPhone(who.phone);
  // Store-review logins are not staff records; they keep the reviewer's checkout flow working.
  if (!viewer) return isReviewPhone(who.phone) ? null : "Your field app access was removed. Contact the office.";
  if (!fieldOfficerSeesOwnFarmers(viewer.role)) return null;
  const farmer = await farmerAssignment(farmerPhone);
  if (farmer?.assignedOfficerId && farmer.assignedOfficerId !== viewer.id) {
    return "This farmer is assigned to another field officer. Ask the office to move them to you.";
  }
  return null;
}
