import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { liveSessionRole } from "@/lib/session-user";
import { createSsoCode, safeNextPath, safeSsoTarget } from "@/lib/sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Billing site: the field or shipping site asks "is this browser signed in here?".
 * Signed in: back to the target's /api/sso/finish with a one-time code.
 * Not signed in: back to the target's login page with ?sso=0 (shows the OTP form, no loop).
 */
export async function GET(req: NextRequest) {
  const target = safeSsoTarget(req.nextUrl.searchParams.get("to"));
  if (!target) return NextResponse.json({ error: "Unknown site" }, { status: 400 });
  const next = safeNextPath(`${target.pathname}${target.search}`);

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  let role = session?.role ?? null;
  if (session) {
    const live = await liveSessionRole(session.userId);
    if (live === null) role = null;
    else if (live !== undefined) role = live;
  }

  if (!session || !role) {
    const login = new URL("/login", target.origin);
    login.searchParams.set("sso", "0");
    if (next !== "/" && !next.startsWith("/login")) login.searchParams.set("returnTo", next);
    return NextResponse.redirect(login);
  }

  const finish = new URL("/api/sso/finish", target.origin);
  finish.searchParams.set("code", await createSsoCode(session.userId, role, target.hostname));
  finish.searchParams.set("next", next);
  const res = NextResponse.redirect(finish);
  // The code is in the URL for one hop only; keep it out of caches and Referer headers.
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
