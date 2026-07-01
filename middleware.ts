import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files, api routes, and icons
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get("skywin_session")?.value;

  if (!session) {
    if (pathname !== "/login") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } else {
    const [, role] = session.split(":");
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Role-based route protection
    if (role !== "admin") {
      // Non-admins cannot access user management and global settings
      if (pathname.startsWith("/users") || pathname.startsWith("/settings")) {
        return NextResponse.redirect(new URL("/", request.url));
      }

      if (role === "dealer") {
        // Dealers are highly restricted. They can only see:
        // - Dashboard (/)
        // - Invoices (/invoices and /invoices/[id])
        // - Outstanding (/accounts/outstanding)
        // - POS (to view/order, though standard POS might be disabled or filtered, let's keep it allowed but filtered)
        const allowedPaths = ["/", "/pos", "/invoices", "/accounts/outstanding"];
        const isAllowed = allowedPaths.some(
          (path) => pathname === path || pathname.startsWith(path + "/")
        );
        if (!isAllowed) {
          return NextResponse.redirect(new URL("/", request.url));
        }
      }

      if (role === "sales_officer") {
        // Sales Officers cannot access purchases/entry or suppliers
        if (
          pathname.startsWith("/purchases") ||
          pathname.startsWith("/suppliers")
        ) {
          return NextResponse.redirect(new URL("/", request.url));
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
