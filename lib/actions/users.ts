"use server";

import { db } from "@/db";
import { users, reportingLines, dealerMappings, customers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";

async function verifyAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    throw new Error("Unauthorized. Only administrators can perform this action.");
  }
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
  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/users");
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
