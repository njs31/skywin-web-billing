import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { canManageField, matrixCanAccessPath } from "@/lib/user-roles";

const FIELD_HOST = "skywin-field.qwicksapp.com";
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
  const session = await verifySessionToken(token);
  const fieldSite = requestHost(request) === FIELD_HOST;

  if (fieldSite) {
    if (pathname === "/login" || pathname === "/privacy" || pathname === "/delete-account") return NextResponse.next();
    if (!session) return NextResponse.redirect(new URL("/login", request.url));
    if (!canManageField(session.role)) {
      return NextResponse.redirect(BILLING_ORIGIN);
    }
    if (pathname !== "/field" && !pathname.startsWith("/field/")) {
      return NextResponse.redirect(new URL("/field", request.url));
    }
    return NextResponse.next();
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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = session.role;

  if (role !== "admin") {
    if (
      pathname.startsWith("/users") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/widget")
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    if (pathname === "/field" || pathname.startsWith("/field/")) {
      if (role !== "regional_manager") {
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
      const allowedPaths = ["/", "/pos", "/invoices", "/accounts/outstanding", "/accounts/credit"];
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
