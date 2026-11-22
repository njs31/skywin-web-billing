/**
 * Field app sign-in: WhatsApp OTP checked on the server, then a signed login token.
 *
 * Stateless, so it works across Cloud Run instances without a table:
 *  - An OTP "challenge" is an HMAC over (phone, role, expiry, nonce, code). The code itself
 *    is never stored or returned; only someone who received it can make the HMAC match.
 *  - A login token is an HMAC-signed payload with the phone, role and officer id.
 *
 * Secret: FIELD_AUTH_SECRET, else SESSION_SECRET / ADMIN_PASSWORD (already set in production).
 * Each use is domain-separated, so a web session token never verifies as a field token.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export type FieldRole = "farmer" | "officer" | "manager";

export type FieldIdentity = {
  phone: string;
  role: FieldRole;
  officerId?: number;
  exp: number;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_PREFIX = "sf1";

/** Store-review logins. The reviewer cannot receive WhatsApp. These are already public in the app. */
const REVIEW_LOGINS: Record<string, { code: string; roles: FieldRole[] }> = {
  "9000000001": { code: "482916", roles: ["officer", "manager"] },
  "9000000002": { code: "739154", roles: ["farmer"] },
};

function secret(): string {
  const value =
    process.env.FIELD_AUTH_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FIELD_AUTH_SECRET (or SESSION_SECRET) must be set");
  }
  return "skywin-field-dev-secret";
}

function mac(domain: string, payload: string): string {
  return createHmac("sha256", secret()).update(`skywin-field:${domain}:${payload}`).digest("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function cleanMobile(phone: string | null | undefined): string {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(-10);
}

export function isValidMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone) || phone in REVIEW_LOGINS;
}

export function reviewLogin(phone: string, role: FieldRole) {
  const hit = REVIEW_LOGINS[phone];
  return hit && hit.roles.includes(role) ? hit.code : null;
}

export function isReviewPhone(phone: string) {
  return phone in REVIEW_LOGINS;
}

export function newOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

/** A challenge the app sends back with the code. Valid for 10 minutes. */
export function createOtpChallenge(phone: string, role: FieldRole, code: string, now = Date.now()): string {
  const exp = now + OTP_TTL_MS;
  const nonce = randomBytes(9).toString("base64url");
  const payload = `${phone}.${role}.${exp}.${nonce}`;
  return `${payload}.${mac("otp", `${payload}.${code}`)}`;
}

export type OtpCheck =
  | { ok: true; phone: string; role: FieldRole }
  | { ok: false; error: "invalid" | "expired" | "mismatch" };

export function checkOtpChallenge(
  challenge: string,
  input: { phone: string; role: FieldRole; code: string },
  now = Date.now()
): OtpCheck {
  const parts = String(challenge || "").split(".");
  if (parts.length !== 5) return { ok: false, error: "invalid" };
  const [phone, role, expStr, nonce, sig] = parts as [string, string, string, string, string];
  if (phone !== input.phone || role !== input.role) return { ok: false, error: "mismatch" };
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, error: "invalid" };
  if (now > exp) return { ok: false, error: "expired" };
  const code = String(input.code || "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "mismatch" };
  const expected = mac("otp", `${phone}.${role}.${expStr}.${nonce}.${code}`);
  if (!same(sig, expected)) return { ok: false, error: "mismatch" };
  return { ok: true, phone, role: role as FieldRole };
}

// Challenges that already signed someone in, until they expire. One server instance, so memory works.
const usedChallenges = new Map<string, number>();

/**
 * Marks a verified challenge as used. False when it was used before, so a code that was seen
 * (or a replayed request) cannot mint a second login token within its 10 minutes.
 */
export function consumeOtpChallenge(challenge: string, now = Date.now()): boolean {
  const parts = String(challenge || "").split(".");
  const sig = parts[4];
  const exp = Number(parts[2]);
  if (!sig || !Number.isFinite(exp)) return false;
  if (usedChallenges.size > 2000) {
    for (const [key, until] of usedChallenges) if (until < now) usedChallenges.delete(key);
  }
  if (usedChallenges.has(sig)) return false;
  usedChallenges.set(sig, exp);
  return true;
}

export function createFieldToken(identity: Omit<FieldIdentity, "exp">, now = Date.now()): string {
  const body: FieldIdentity = { ...identity, exp: now + TOKEN_TTL_MS };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${TOKEN_PREFIX}.${payload}.${mac("token", payload)}`;
}

export function verifyFieldToken(token: string | null | undefined, now = Date.now()): FieldIdentity | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, payload, sig] = parts as [string, string, string];
  if (!same(sig, mac("token", payload))) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as FieldIdentity;
    if (!body || typeof body.phone !== "string" || !/^\d{10}$/.test(body.phone)) return null;
    if (!["farmer", "officer", "manager"].includes(body.role)) return null;
    if (!Number.isFinite(body.exp) || now > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

/** The signed-in field user, when the request carries a login token. */
export function fieldIdentity(req: NextRequest | Request): FieldIdentity | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return verifyFieldToken(auth.slice(7).trim());
}

/**
 * Whether the old shared app key still opens field routes. Apps published before login tokens
 * only have that key. Set FIELD_LEGACY_KEY=off once every phone runs the token build.
 */
export function legacyFieldKeyAllowed(): boolean {
  return (process.env.FIELD_LEGACY_KEY || "").trim().toLowerCase() !== "off";
}

// ---- Simple per-instance rate limiting ---------------------------------------------------

const hits = new Map<string, number[]>();

/** True when `key` has been used `max` times within `windowMs`. Records this attempt. */
export function rateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    // Keep a day of history so daily limits survive the clean-up.
    for (const [k, times] of hits) if (!times.some((t) => now - t < 24 * 60 * 60 * 1000)) hits.delete(k);
  }
  return recent.length > max;
}

export function clientIp(req: NextRequest | Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
