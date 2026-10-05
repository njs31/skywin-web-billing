import { db } from "@/db";
import { activityLogs } from "@/db/schema";
import { desc, ilike, or, sql, and, type SQL } from "drizzle-orm";

export async function recordActivity(input: {
  action: string;
  message: string;
  entityType?: string | null;
  entityId?: number | null;
  actor?: { id: number; name: string } | null;
}): Promise<void> {
  try {
    let actor = input.actor ?? null;
    if (!actor) {
      const { getCurrentUser } = await import("@/lib/actions/auth");
      const user = await getCurrentUser();
      if (!user) return;
      actor = { id: user.id, name: user.name.trim() || user.phone };
    }
    const name = actor.name.trim() || "Unknown";
    await db.insert(activityLogs).values({
      userId: actor.id,
      userName: name,
      action: input.action,
      message: input.message,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    });
  } catch (error) {
    console.error("[activity-log] failed to record:", error);
  }
}

export async function getActivityLogs(opts: {
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(20, opts.pageSize ?? 50));
  const q = opts.q?.trim() ?? "";

  const conditions: SQL[] = [];
  if (q) {
    const pattern = `%${q}%`;
    const match = or(
      ilike(activityLogs.message, pattern),
      ilike(activityLogs.userName, pattern),
      ilike(activityLogs.action, pattern)
    );
    if (match) conditions.push(match);
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(activityLogs)
    .where(where ?? sql`true`);

  const rows = await db
    .select({
      id: activityLogs.id,
      userName: activityLogs.userName,
      action: activityLogs.action,
      message: activityLogs.message,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(where ?? sql`true`)
    .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total: total ?? 0, page, pageSize };
}

export { activityLogs };
