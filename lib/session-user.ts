import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * The signed-in user's current role from the database.
 * null: the user no longer exists. undefined: the database could not be reached
 * (callers then fall back to the signed cookie instead of signing everyone out).
 */
export async function liveSessionRole(userId: number): Promise<string | null | undefined> {
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    return row ? row.role : null;
  } catch {
    return undefined;
  }
}
