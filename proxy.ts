import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  sessionNeedsRefresh,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";
import { liveSessionRole } from "@/lib/session-user";
import { canManageField, isSalesManager, matrixCanAccessPath, salesManagerMayOpen } from "@/lib/user-roles";

const FIELD_HOST = "skywin-field.qwicksapp.com";
const SHIPPING_HOST = "shipping.qwicksapp.com";
const FIELD_ORIGIN = "https://skywin-field.qwicksapp.com";
const SHIPPING_ORIGIN = "https://shipping.qwicksapp.com";
const BILLING_ORIGIN = "https://skywin.qwicksapp.com";

function requestHost(request: NextRequest) {
  const raw = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  return raw.split(",")[0].trim().split(":")[0].toLowerCase();
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let session = await verifySessionToken(token);
  let endSession = false;
  if (session) {
    // Long-lived sessions are re-checked against the database on every page:
    // a deleted user or a changed role signs that browser out.
    const liveRole = await liveSessionRole(session.userId);
    if (liveRole === null || (liveRole !== undefined && liveRole !== session.role)) {
      session = null;
      endSession = true;
    }
  } else if (token) {
    endSession = true;
  }

  const response = await route(request, session);

  if (endSession) {
    response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  } else if (
    session &&
    request.method === "GET" &&
    !request.headers.has("next-action") &&
    sessionNeedsRefresh(session.exp)
  ) {
    // Rolling refresh: the user stays signed in until they press Logout.
    response.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(session.userId, session.role),
      sessionCookieOptions()
    );
  }

  return response;
}

async function route(request: NextRequest, session: SessionPayload | null) {
  const { pathname } = request.nextUrl;
  const host = requestHost(request);
  const fieldSite = host === FIELD_HOST;
  const shippingSite = host === SHIPPING_HOST;

  if (shippingSite) {
    // In-app navigations (sidebar links) fetch with an RSC header; a plain page load does not.
    const clientNav =
      request.headers.get("rsc") === "1" ||
      request.headers.has("next-router-prefetch") ||
      request.nextUrl.searchParams.has("_rsc");
    const deniedNotice = pathname === "/login" && request.nextUrl.searchParams.get("denied") === "shipping";
    if (session && !deniedNotice && (pathname === "/login" || (pathname === "/" && !clientNav))) {
      return NextResponse.redirect(new URL("/shipping", request.url));
    }
    if (pathname === "/login" || pathname === "/privacy" || pathname === "/delete-account") return NextResponse.next();
    if (!session) {
      const returnTo = pathname !== "/shipping" ? `?returnTo=${encodeURIComponent(pathname)}` : "";
      return NextResponse.redirect(new URL(`/login${returnTo}`, request.url));
    }
    if (pathname !== "/shipping" && !pathname.startsWith("/shipping/")) {
      // Billing sections (sidebar Orders, Invoices, ...) open on the billing site. Sending them back
      // to /shipping left the page on the same URL with the navigation spinner showing.
      const dest = new URL(`${pathname}${request.nextUrl.search}`, BILLING_ORIGIN);
      dest.searchParams.delete("_rsc");
      return NextResponse.redirect(dest);
    }
    return NextResponse.next();
  }

  if (fieldSite) {
    if (session && pathname === "/login") {
      const dest = isSalesManager(session.role)
        ? "/field/team"
        : session.role === "sales_officer"
          ? "/field/recommendations"
          : "/field";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    if (pathname === "/login" || pathname === "/privacy" || pathname === "/delete-account") return NextResponse.next();
    if (!session) {
      const returnTo = pathname !== "/field" ? `?returnTo=${encodeURIComponent(pathname)}` : "";
      return NextResponse.redirect(new URL(`/login${returnTo}`, request.url));
    }
    if (isSalesManager(session.role)) {
      if (!salesManagerMayOpen(pathname)) {
        return NextResponse.redirect(new URL("/field/team", request.url));
      }
      return NextResponse.next();
    }
    if (session.role === "sales_officer") {
      // Field officers may use only Recommendations on the field site.
      if (pathname === "/field/recommendations" || pathname.startsWith("/field/recommendations/")) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL("/field/recommendations", request.url));
    }
    if (!canManageField(session.role)) {
      return NextResponse.redirect(BILLING_ORIGIN);
    }
    if (pathname !== "/field" && !pathname.startsWith("/field/")) {
      return NextResponse.redirect(new URL("/field", request.url));
    }
    return NextResponse.next();
  }

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (
    pathname === "/login" ||
    pathname === "/privacy" ||
    pathname === "/delete-account" ||
    pathname === "/pay" ||
    pathname.startsWith("/pay/")
  ) {
    return NextResponse.next();
  }

  if (!session) {
    const returnTo = pathname !== "/" ? `?returnTo=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(new URL(`/login${returnTo}`, request.url));
  }

  const role = session.role;

  if (isSalesManager(role)) {
    return NextResponse.redirect(`${FIELD_ORIGIN}/login`);
  }

  if (role !== "admin") {
    if (pathname === "/shipping" || pathname.startsWith("/shipping/")) {
      return NextResponse.next();
    }

    if (
      pathname.startsWith("/users") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/widget")
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    if (pathname === "/field" || pathname.startsWith("/field/")) {
      const officerRecommendations =
        role === "sales_officer" &&
        (pathname === "/field/recommendations" || pathname.startsWith("/field/recommendations/"));
      if (role !== "regional_manager" && !officerRecommendations) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    const matrixAccess = matrixCanAccessPath(role, pathname);
    if (matrixAccess === false) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (matrixAccess === true) {
      return NextResponse.next();
    }

    if (role === "dealer") {
      const allowedPaths = ["/", "/pos", "/invoices", "/customers", "/accounts/outstanding", "/accounts/credit"];
      const isAllowed = allowedPaths.some(
        (path) => pathname === path || pathname.startsWith(path + "/")
      );
      if (!isAllowed) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    if (role === "sales_officer") {
      if (
        pathname.startsWith("/purchases") ||
        pathname.startsWith("/suppliers")
      ) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
