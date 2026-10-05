"use server";

import { db } from "@/db";
import { users, reportingLines, dealerMappings, customers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./auth";
import { SEED_ADMIN_PHONE } from "@/lib/user-roles";

async function verifyAdmin() {
  await requireAdmin();
}

export async function getUsers() {
  await verifyAdmin();
  return db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
      customerId: users.customerId,
      customerName: customers.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(customers, eq(users.customerId, customers.id))
    .orderBy(users.name);
}

export async function getCustomersForMapping() {
  await verifyAdmin();
  return db.select().from(customers).orderBy(customers.name);
}

export async function createUser(data: {
  name: string;
  phone: string;
  role: "admin" | "regional_manager" | "sales_officer" | "dealer";
  customerId?: number | null;
}) {
  await verifyAdmin();

  const cleanPhone = data.phone.trim();
  const cleanName = data.name.trim();

  if (!cleanName) throw new Error("Name is required");
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error("Valid 10-digit phone number is required");
  }

  // Check unique phone
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.phone, cleanPhone))
    .limit(1);

  if (existing) {
    throw new Error(`A user with phone number ${cleanPhone} already exists.`);
  }

  const [created] = await db
    .insert(users)
    .values({
      name: cleanName,
      phone: cleanPhone,
      role: data.role,
      customerId: data.role === "dealer" ? (data.customerId || null) : null,
    })
    .returning();

  revalidatePath("/users");
  return created;
}

export async function deleteUser(id: number) {
  await verifyAdmin();
  const [target] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (target?.phone === SEED_ADMIN_PHONE) {
    throw new Error("The primary administrator account cannot be deleted.");
  }
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/users");
}

export async function updateUserRole(data: {
  userId: number;
  role: "admin" | "regional_manager" | "sales_officer" | "dealer";
  customerId?: number | null;
}) {
  const actor = await requireAdmin();
  const { roleLabel, validateRoleChange, isUserRole } = await import(
    "@/lib/user-roles"
  );
  if (!isUserRole(data.role)) {
    throw new Error("Unknown role.");
  }

  const [target] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
      customerId: users.customerId,
    })
    .from(users)
    .where(eq(users.id, data.userId))
    .limit(1);
  if (!target) throw new Error("User not found.");
  if (!isUserRole(target.role)) {
    throw new Error("Unknown current role.");
  }

  const customerId =
    data.role === "dealer" ? data.customerId ?? target.customerId : null;

  const [{ adminCount }] = await db
    .select({ adminCount: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "admin"));

  const problem = validateRoleChange({
    targetPhone: target.phone,
    currentRole: target.role,
    newRole: data.role,
    customerId,
    adminCount: Number(adminCount ?? 0),
  });
  if (problem) throw new Error(problem);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        role: data.role,
        customerId,
      })
      .where(eq(users.id, data.userId));

    if (data.role !== "regional_manager") {
      await tx
        .delete(reportingLines)
        .where(eq(reportingLines.managerId, data.userId));
    }
    if (data.role !== "sales_officer") {
      await tx
        .delete(reportingLines)
        .where(eq(reportingLines.officerId, data.userId));
      await tx
        .delete(dealerMappings)
        .where(eq(dealerMappings.officerId, data.userId));
    }
    if (data.role !== "dealer") {
      await tx
        .delete(dealerMappings)
        .where(eq(dealerMappings.dealerId, data.userId));
    }
  });

  if (target.role !== data.role) {
    const { recordActivity } = await import("@/lib/queries/activity-logs");
    const name = actor.name.trim() || actor.phone;
    const { roleChangeMessage } = await import("@/lib/activity-log");
    await recordActivity({
      action: "user.role",
      message: roleChangeMessage(
        name,
        target.name,
        roleLabel(target.role),
        roleLabel(data.role)
      ),
      entityType: "user",
      entityId: data.userId,
      actor: { id: actor.id, name },
    });
  }

  revalidatePath("/users");
  revalidatePath("/logs");
}

export async function getReportingLines() {
  await verifyAdmin();
  const m = sql`m`;
  const o = sql`o`;
  return db
    .select({
      id: reportingLines.id,
      managerId: reportingLines.managerId,
      managerName: sql<string>`m.name`,
      officerId: reportingLines.officerId,
      officerName: sql<string>`o.name`,
    })
    .from(reportingLines)
    .innerJoin(users, eq(reportingLines.managerId, users.id))
    .innerJoin(reportingLines, eq(reportingLines.officerId, users.id));
}

// Custom select query to join users table properly as managers and officers
export async function getReportingLinesRaw() {
  await verifyAdmin();
  const lines = await db.select().from(reportingLines);
  const allUsers = await db.select().from(users);

  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  return lines.map((l) => ({
    id: l.id,
    managerId: l.managerId,
    managerName: userMap.get(l.managerId) ?? "Unknown",
    officerId: l.officerId,
    officerName: userMap.get(l.officerId) ?? "Unknown",
  }));
}

export async function createReportingLine(managerId: number, officerId: number) {
  await verifyAdmin();

  if (managerId === officerId) {
    throw new Error("A manager cannot report to themselves.");
  }

  const [existing] = await db
    .select()
    .from(reportingLines)
    .where(
      and(
        eq(reportingLines.managerId, managerId),
        eq(reportingLines.officerId, officerId)
      )
    )
    .limit(1);

  if (existing) {
    throw new Error("This reporting line mapping already exists.");
  }

  const [created] = await db
    .insert(reportingLines)
    .values({ managerId, officerId })
    .returning();

  revalidatePath("/users");
  return created;
}

export async function deleteReportingLine(id: number) {
  await verifyAdmin();
  await db.delete(reportingLines).where(eq(reportingLines.id, id));
  revalidatePath("/users");
}

export async function getDealerMappingsRaw() {
  await verifyAdmin();
  const mappings = await db.select().from(dealerMappings);
  const allUsers = await db.select().from(users);

  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  return mappings.map((m) => ({
    id: m.id,
    officerId: m.officerId,
    officerName: userMap.get(m.officerId) ?? "Unknown",
    dealerId: m.dealerId,
    dealerName: userMap.get(m.dealerId) ?? "Unknown",
  }));
}

export async function createDealerMapping(officerId: number, dealerId: number) {
  await verifyAdmin();

  if (officerId === dealerId) {
    throw new Error("An officer cannot map to themselves.");
  }

  const [existing] = await db
    .select()
    .from(dealerMappings)
    .where(
      and(
        eq(dealerMappings.officerId, officerId),
        eq(dealerMappings.dealerId, dealerId)
      )
    )
    .limit(1);

  if (existing) {
    throw new Error("This dealer mapping already exists.");
  }

  const [created] = await db
    .insert(dealerMappings)
    .values({ officerId, dealerId })
    .returning();

  revalidatePath("/users");
  return created;
}

export async function deleteDealerMapping(id: number) {
  await verifyAdmin();
  await db.delete(dealerMappings).where(eq(dealerMappings.id, id));
  revalidatePath("/users");
}
