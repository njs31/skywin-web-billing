import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldIdentity } from "@/lib/field-auth";
import { db } from "@/db";
import { orderNotifications } from "@/db/schema";
import { desc, eq, or, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const who = fieldIdentity(req);
    const rawPhone = who ? who.phone : req.nextUrl.searchParams.get("phone") || "";
    const cleanPhone = rawPhone.replace(/\D/g, "").slice(-10);
    const orderId = who ? "" : req.nextUrl.searchParams.get("orderId") || "";

    let query = db.select().from(orderNotifications).$dynamic();

    if (cleanPhone && orderId) {
      query = query.where(
        or(
          eq(orderNotifications.phone, cleanPhone),
          eq(orderNotifications.orderId, orderId)
        )
      );
    } else if (cleanPhone) {
      query = query.where(eq(orderNotifications.phone, cleanPhone));
    } else if (orderId) {
      query = query.where(eq(orderNotifications.orderId, orderId));
    }

    const rows = await query.orderBy(desc(orderNotifications.createdAt)).limit(50);

    return fieldJson({
      notifications: rows.map((r) => ({
        id: r.id,
        orderId: r.orderId,
        title: r.title,
        body: r.body,
        checkpoint: r.checkpoint,
        at: r.createdAt.getTime(),
        date: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Failed to load notifications" }, 500);
  }
}
