import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { canSignInAsFieldOfficer } from "@/lib/user-roles";
import { fieldOfficerSeesOwnFarmers } from "@/lib/field-officer-names";

export { fieldOfficerSeesOwnFarmers };

export async function fieldAppUserByPhone(phone: string) {
  const mobile = phone.replace(/\D/g, "").slice(-10);
  if (mobile.length !== 10) return null;
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      access: users.fieldAppAccess,
    })
    .from(users)
    .where(sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${mobile}`)
    .limit(1);
  if (!user?.access || !canSignInAsFieldOfficer(user.role)) return null;
  return { id: user.id, name: user.name.trim() || "Field officer", role: user.role };
}
