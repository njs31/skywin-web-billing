import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { canSignInAsFieldOfficer } from "@/lib/user-roles";
import type { FieldRole } from "@/lib/field-auth";

const MANAGER_ROLES = new Set(["admin", "regional_manager"]);

/** The billing user allowed to sign in to the field app as this role, or null. */
export async function fieldStaffForLogin(phone: string, role: Exclude<FieldRole, "farmer">) {
  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, access: users.fieldAppAccess })
    .from(users)
    .where(sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${phone}`)
    .limit(1);
  if (!user || !user.access) return null;
  const allowed = role === "manager" ? MANAGER_ROLES.has(user.role) : canSignInAsFieldOfficer(user.role);
  return allowed ? { id: user.id, name: user.name.trim() || "Field officer", role: user.role } : null;
}
