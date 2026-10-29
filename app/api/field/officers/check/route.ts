import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set(["admin", "regional_manager"]);

export function OPTIONS() {
  return fieldOptions();
}

/**
 * Field app login gate. Officer login: sales_officer with app access, or an
 * admin / regional manager. Manager login: admin / regional manager only.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }
  const phone = (req.nextUrl.searchParams.get("phone") ?? "").replace(/\D/g, "").slice(-10);
  const as = req.nextUrl.searchParams.get("as") === "manager" ? "manager" : "officer";
  if (phone.length !== 10) return fieldJson({ allowed: false, reason: "invalid_phone" });

  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, access: users.fieldAppAccess })
    .from(users)
    .where(sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${phone}`)
    .limit(1);

  const isManager = !!user && MANAGER_ROLES.has(user.role);
  const allowed =
    !!user &&
    user.access &&
    (as === "manager" ? isManager : isManager || user.role === "sales_officer");

  return fieldJson({
    allowed,
    reason: allowed ? undefined : "not_registered",
    officer: allowed ? { id: user!.id, name: user!.name, role: user!.role } : undefined,
  });
}
