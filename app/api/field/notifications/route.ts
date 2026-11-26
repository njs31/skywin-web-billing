import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { fieldIdentity } from "@/lib/field-auth";
import { db } from "@/db";
import { orderNotifications } from "@/db/schema";
import { desc, eq, or, sql } from "drizzle-orm";
import { feedBroadcasts } from "@/lib/field-broadcast";
import { broadcastRoute, broadcastText, pushPreview } from "@/lib/field-broadcast-rules";

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

    // Never list every phone's feed: a request must name whose notifications it wants.
    if (!cleanPhone && !orderId) return fieldJson({ notifications: [] });

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

    // Messages sent by SkyWin to every app user, in the app's language. Only apps that send ?lang=
    // have the screen that opens them; older apps would land on an unknown screen, so they don't get them.
    let news: Array<{ id: string; orderId: null; title: string; body: string; checkpoint: null; url: string; at: number; date: string; kind: "news"; productId: number | null }> = [];
    const asked = req.nextUrl.searchParams.get("lang");
    if (cleanPhone && (asked === "ta" || asked === "en")) {
      const lang = asked;
      news = (await feedBroadcasts(50)).map((b) => {
        const text = broadcastText(b, lang);
        return {
          id: `news-${b.id}`,
          orderId: null,
          title: text.title,
          body: pushPreview(text.body, !!(b.imageUrl || b.linkUrl || b.videoUrl), text.lang),
          checkpoint: null,
          url: broadcastRoute(b.id),
          at: b.createdAt.getTime(),
          date: b.createdAt.toISOString(),
          kind: "news" as const,
          // The app shows "View product" for this; older apps ignore it.
          productId: b.productId ?? null,
        };
      });
    }

    const own = rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      title: r.title,
      body: r.body,
      checkpoint: r.checkpoint,
      url: r.url || (r.orderId ? `/order/${r.orderId}` : null),
      at: r.createdAt.getTime(),
      date: r.createdAt.toISOString(),
    }));

    return fieldJson({
      // Newest first by date and time.
      notifications: [...own, ...news].sort((a, b) => b.at - a.at).slice(0, 80),
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Failed to load notifications" }, 500);
  }
}
