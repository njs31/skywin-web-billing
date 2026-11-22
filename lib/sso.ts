/**
 * Single sign-on between the billing, field and shipping sites.
 *
 * Each site keeps its own host-only session cookie (it is never shared with other
 * *.qwicksapp.com sites). When the field or shipping site has no session, it sends the browser
 * to the billing site's /api/sso/start. If the browser is signed in there, billing hands back
 * a one-time code (60 seconds, single use, bound to the target host); the target site's
 * /api/sso/finish turns it into its own session. If not, the browser returns to the normal
 * login page with ?sso=0, so it never loops.
 */
import { randomUUID } from "node:crypto";
import { signValue, safeEqual } from "@/lib/session";
import { BILLING_ORIGIN, hostName, isFieldHost, isShippingHost } from "@/lib/site-hosts";

const CODE_TTL_MS = 60_000;
/** Codes already used, until they expire. One app container, so memory is enough. */
const used = new Map<string, number>();

export function isSsoTargetHost(host: string) {
  return isFieldHost(host) || isShippingHost(host);
}

/** The target URL, if it is an https page on the field or shipping site; otherwise null. */
export function safeSsoTarget(raw: string | null | undefined): URL | null {
  try {
    const url = new URL(String(raw || ""));
    if (url.protocol !== "https:" || !isSsoTargetHost(url.hostname) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** A same-site path to continue to after sign-in ("/field", "/shipping?x=1"), never another site. */
export function safeNextPath(raw: string | null | undefined, fallback = "/") {
  const value = String(raw || "");
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();

export async function createSsoCode(userId: number, role: string, host: string) {
  const payload = b64(JSON.stringify({ u: userId, r: role, h: hostName(host), e: Date.now() + CODE_TTL_MS, n: randomUUID() }));
  return `${payload}.${await signValue(`sso:${payload}`)}`;
}

/** The user in a valid, unused code for this host; null otherwise. Marks the code used. */
export async function redeemSsoCode(code: string | null | undefined, host: string) {
  const [payload, sig] = String(code || "").split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await signValue(`sso:${payload}`))) return null;
  let data: { u?: number; r?: string; h?: string; e?: number; n?: string };
  try {
    data = JSON.parse(unb64(payload));
  } catch {
    return null;
  }
  const now = Date.now();
  if (!data.u || !data.r || !data.n || !data.e || data.e < now) return null;
  if (data.h !== hostName(host)) return null;
  for (const [nonce, exp] of used) if (exp < now) used.delete(nonce);
  if (used.has(data.n)) return null;
  used.set(data.n, data.e);
  return { userId: data.u, role: data.r };
}

/** Where a signed-out field/shipping page sends the browser to borrow the billing session. */
export function ssoStartUrl(target: string) {
  return `${BILLING_ORIGIN}/api/sso/start?to=${encodeURIComponent(target)}`;
}
