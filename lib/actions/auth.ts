"use server";

import { cookies } from "next/headers";
import { db } from "@/db";
import { users, reportingLines, dealerMappings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function sendOtp(phone: string) {
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

  // Generate a mock 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

  await db
    .update(users)
    .set({
      otp,
      otpExpiry: expiry,
    })
    .where(eq(users.id, user.id));

  return { success: true, mockOtp: otp };
}

export async function verifyOtp(phone: string, otp: string) {
  const cleanPhone = phone.trim();
  const cleanOtp = otp.trim();

  if (!cleanPhone || !cleanOtp) {
    throw new Error("Phone number and OTP are required");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, cleanPhone))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.otp || !user.otpExpiry) {
    throw new Error("OTP not requested or expired");
  }

  if (user.otpExpiry < new Date()) {
    throw new Error("OTP expired. Please request a new one.");
  }

  if (user.otp !== cleanOtp) {
    throw new Error("Invalid OTP");
  }

  // Clear OTP on success
  await db
    .update(users)
    .set({
      otp: null,
      otpExpiry: null,
    })
    .where(eq(users.id, user.id));

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
    if (!session) return null;

    const [userIdStr] = session.split(":");
    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId)) return null;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user ?? null;
  } catch (e) {
    return null;
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
