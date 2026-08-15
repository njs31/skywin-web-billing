import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

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

  if (pathname === "/login") {
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

    if (role === "dealer") {
      const allowedPaths = ["/", "/pos", "/invoices", "/accounts/outstanding"];
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
