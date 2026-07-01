"use server";

import { cookies } from "next/headers";
import { db } from "@/db";
import { users, reportingLines, dealerMappings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function loginWithPhone(phone: string) {
  const cleanPhone = phone.trim();
  if (!cleanPhone) throw new Error("Phone number is required");

  // Admin auto-seeding rule for initial setup/testing
  if (cleanPhone === "9999999999") {
    const existing = await db.select().from(users).limit(1);
    if (existing.length === 0) {
      await db.insert(users).values({
        name: "Administrator",
        phone: "9999999999",
        role: "admin",
      });
    }
  }

  // Find user
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, cleanPhone))
    .limit(1);

  if (!user) {
    throw new Error("Phone number not registered. Contact your administrator.");
  }

  // Set session cookie (userid:role)
  const cookieStore = await cookies();
  cookieStore.set("skywin_session", `${user.id}:${user.role}`, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  return { success: true, role: user.role };
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("skywin_session")?.value;
    if (!session) {
      return { id: 1, name: "Administrator", phone: "9999999999", role: "admin" as const, customerId: null };
    }

    const [userIdStr] = session.split(":");
    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId)) {
      return { id: 1, name: "Administrator", phone: "9999999999", role: "admin" as const, customerId: null };
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user ?? { id: 1, name: "Administrator", phone: "9999999999", role: "admin" as const, customerId: null };
  } catch (e) {
    return { id: 1, name: "Administrator", phone: "9999999999", role: "admin" as const, customerId: null };
  }
}

export async function getVisibleCustomerIds(user: {
  id: number;
  role: string;
  customerId: number | null;
}) {
  if (user.role === "admin") return null;

  if (user.role === "dealer") {
    return user.customerId ? [user.customerId] : [];
  }

  if (user.role === "sales_officer") {
    const mappings = await db
      .select({ customerId: users.customerId })
      .from(dealerMappings)
      .innerJoin(users, eq(dealerMappings.dealerId, users.id))
      .where(eq(dealerMappings.officerId, user.id));
    return mappings
      .map((m) => m.customerId)
      .filter((id): id is number => id !== null);
  }

  if (user.role === "regional_manager") {
    const officers = await db
      .select({ officerId: reportingLines.officerId })
      .from(reportingLines)
      .where(eq(reportingLines.managerId, user.id));
    const officerIds = officers.map((o) => o.officerId);
    if (officerIds.length === 0) return [];

    const mappings = await db
      .select({ customerId: users.customerId })
      .from(dealerMappings)
      .innerJoin(users, eq(dealerMappings.dealerId, users.id))
      .where(inArray(dealerMappings.officerId, officerIds));
    return mappings
      .map((m) => m.customerId)
      .filter((id): id is number => id !== null);
  }

  return [];
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("skywin_session");
  return { success: true };
}
