"use server";

import { timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, reportingLines, dealerMappings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { sendWhatsAppOtp } from "@/lib/services/interakt";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  createSessionToken,
  verifySessionToken,
} from "@/lib/session";

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

function otpMatches(provided: string, expected: string) {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(key: string) {
  const now = Date.now();
  const row = loginAttempts.get(key);
  if (!row || now > row.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  row.count += 1;
  return row.count > 8;
}

async function setSession(user: { id: number; role: string }) {
  const cookieStore = await cookies();
  const token = await createSessionToken(user.id, user.role);
  cookieStore.set(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

/** Admin (9999999999) signs in with ADMIN_PASSWORD from env — no WhatsApp OTP. */
export async function loginWithAdminPassword(phone: string, password: string) {
  const cleanPhone = phone.trim().replace(/\D/g, "");
  if (cleanPhone !== ADMIN_PHONE) {
    return { success: false as const, error: "Password login is only for the admin account." };
  }

  if (tooManyAttempts(`admin:${cleanPhone}`)) {
    return { success: false as const, error: "Too many attempts. Try again later." };
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

  if (tooManyAttempts(`otp:${cleanPhone}`)) {
    return { success: false as const, error: "Too many attempts. Try again later." };
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

  if (process.env.NODE_ENV === "development") {
    console.log(`[SKYWIN AUTH] Generated OTP for ${cleanPhone}: ${otp}`);
  }

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

  if (tooManyAttempts(`otp-verify:${cleanPhone}`)) {
    return { success: false as const, error: "Too many attempts. Try again later." };
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
    if (!user.otp || !otpMatches(cleanOtp, user.otp)) {
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
    const session = cookieStore.get(SESSION_COOKIE)?.value;
    const parsed = await verifySessionToken(session);
    if (!parsed) return null;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, parsed.userId))
      .limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Unauthorized. Only administrators can perform this action.");
  }
  return user;
}

/** Matches UI: dealers cannot manage products, stock, quotations, or POs. */
export async function requireNonDealer() {
  const user = await requireUser();
  if (user.role === "dealer") {
    throw new Error("Unauthorized");
  }
  return user;
}

/** Matches UI: only admin and regional managers manage purchases/suppliers. */
export async function requirePurchasingAccess() {
  const user = await requireUser();
  if (user.role === "dealer" || user.role === "sales_officer") {
    throw new Error("Unauthorized");
  }
  return user;
}

/**
 * Admin → null (unscoped). Other roles → visible customer ids.
 * Unauthenticated HTTP requests → []. CLI/scripts (no request cookies) → null.
 */
export async function getScopedCustomerIds(): Promise<number[] | null> {
  const user = await getCurrentUser();
  if (user) return getVisibleCustomerIds(user);
  try {
    await cookies();
    return [];
  } catch {
    return null;
  }
}

export async function assertCustomerAccess(customerId?: number | null) {
  if (customerId == null) return;
  const ids = await getScopedCustomerIds();
  if (ids === null) return;
  if (!ids.includes(customerId)) {
    throw new Error("Unauthorized");
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
  cookieStore.delete(SESSION_COOKIE);
  return { success: true };
}
