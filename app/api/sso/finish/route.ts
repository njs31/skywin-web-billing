import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";
import { hostName } from "@/lib/site-hosts";
import { isSsoTargetHost, redeemSsoCode, safeNextPath } from "@/lib/sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Field or shipping site: turns billing's one-time code into this site's own session. */
export async function GET(req: NextRequest) {
  const host = hostName(req.headers.get("x-forwarded-host") || req.headers.get("host"));
  const origin = `https://${host}`;
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const user = isSsoTargetHost(host) ? await redeemSsoCode(req.nextUrl.searchParams.get("code"), host) : null;
  if (!user) {
    // Expired or reused code: show the normal login instead of trying again.
    return NextResponse.redirect(new URL("/login?sso=0", origin));
  }
  // "/" and "/login" let the site send each role to its own home page.
  const res = NextResponse.redirect(new URL(next.startsWith("/login") ? "/" : next, origin));
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user.userId, user.role), sessionCookieOptions());
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
