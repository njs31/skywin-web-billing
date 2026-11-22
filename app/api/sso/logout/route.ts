import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { safeSsoTarget } from "@/lib/sso";
import { BILLING_ORIGIN } from "@/lib/site-hosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Billing site: signing out of the field or shipping site signs out here too, otherwise the
 * next visit would sign straight back in through single sign-on.
 */
export async function GET(req: NextRequest) {
  const target = safeSsoTarget(req.nextUrl.searchParams.get("to"));
  const dest = target ? new URL("/login?sso=0", target.origin) : new URL("/login", BILLING_ORIGIN);
  const res = NextResponse.redirect(dest);
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
