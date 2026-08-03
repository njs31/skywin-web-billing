"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, reportingLines, dealerMappings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { sendWhatsAppOtp } from "@/lib/services/interakt";

const ADMIN_PHONE = "9999999999";

async function ensureAdminUser() {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.phone, ADMIN_PHONE))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      name: "Administrator",
      phone: ADMIN_PHONE,
      role: "admin",
    })
    .returning();
  return created;
}

function passwordsMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function setSession(user: { id: number; role: string }) {
  const cookieStore = await cookies();
  cookieStore.set("skywin_session", `${user.id}:${user.role}`, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
  });
}

/** Admin (9999999999) signs in with ADMIN_PASSWORD from env — no WhatsApp OTP. */
export async function loginWithAdminPassword(phone: string, password: string) {
  const cleanPhone = phone.trim().replace(/\D/g, "");
  if (cleanPhone !== ADMIN_PHONE) {
    return { success: false as const, error: "Password login is only for the admin account." };
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return {
      success: false as const,
      error: "ADMIN_PASSWORD is not configured on the server.",
    };
  }

  if (!password || !passwordsMatch(password, expected)) {
    return { success: false as const, error: "Invalid password." };
  }

  const user = await ensureAdminUser();
  await setSession(user);
  return { success: true as const, role: user.role };
}

export async function sendOtp(phone: string) {
  const cleanPhone = phone.trim().replace(/\D/g, "");
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false as const, error: "Please enter a valid 10-digit phone number" };
  }

  if (cleanPhone === ADMIN_PHONE) {
    return {
      success: false as const,
      error: "Admin uses password login. Enter the admin password instead of OTP.",
    };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, cleanPhone))
    .limit(1);

  if (!user) {
    return {
      success: false as const,
      error: "Phone number not registered. Contact your administrator.",
    };
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000);

  await db
    .update(users)
    .set({ otp, otpExpiry: expiry })
    .where(eq(users.id, user.id));

  console.log(`[SKYWIN AUTH] Generated OTP for ${cleanPhone}: ${otp}`);

  const res = await sendWhatsAppOtp(cleanPhone, otp);

  return {
    success: true as const,
    phone: cleanPhone,
    devOtp: process.env.NODE_ENV === "development" ? otp : undefined,
    whatsappSent: res.success,
    message: res.success
      ? "OTP sent via WhatsApp successfully"
      : "OTP generated. Check WhatsApp or console log.",
  };
}

export async function verifyOtpAndLogin(phone: string, otpInput: string) {
  const cleanPhone = phone.trim().replace(/\D/g, "");
  const cleanOtp = otpInput.trim();

  if (!cleanPhone) {
    return { success: false as const, error: "Phone number is required" };
  }
  if (!cleanOtp) {
    return { success: false as const, error: "Please enter the 6-digit OTP" };
  }

  if (cleanPhone === ADMIN_PHONE) {
    return {
      success: false as const,
      error: "Admin uses password login, not OTP.",
    };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, cleanPhone))
    .limit(1);

  if (!user) {
    return { success: false as const, error: "User not found." };
  }

  const isMasterBypass =
    process.env.NODE_ENV === "development" && cleanOtp === "000000";

  if (!isMasterBypass) {
    if (!user.otp || user.otp !== cleanOtp) {
      return { success: false as const, error: "Invalid OTP code. Please try again." };
    }

    if (!user.otpExpiry || new Date() > user.otpExpiry) {
      return {
        success: false as const,
        error: "OTP has expired. Please request a new code.",
      };
    }
  }

  await db
    .update(users)
    .set({ otp: null, otpExpiry: null })
    .where(eq(users.id, user.id));

  await setSession(user);
  return { success: true as const, role: user.role };
}

export async function loginWithPhone(phone: string) {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    return {
      success: false as const,
      error: "Direct login is disabled. Please use WhatsApp OTP verification.",
    };
  }
  const cleanPhone = phone.trim().replace(/\D/g, "");
  if (!cleanPhone) {
    return { success: false as const, error: "Phone number is required" };
  }

  if (cleanPhone === ADMIN_PHONE) {
    await ensureAdminUser();
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, cleanPhone))
    .limit(1);

  if (!user) {
    return {
      success: false as const,
      error: "Phone number not registered. Contact your administrator.",
    };
  }

  await setSession(user);
  return { success: true as const, role: user.role };
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
  } catch {
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
