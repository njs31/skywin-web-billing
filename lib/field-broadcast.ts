/**
 * Notifications a manager sends to every Field app user (Field → Notifications).
 *
 * - One push per registered device, its heading in that phone's app language (the language the
 *   app sent with its push token; else the farmer's saved language; else English).
 * - Tapping it opens the message in the app's in-app browser (/news/<id> in the app, which opens
 *   https://<billing>/news/<id>); closing that lands on the app's Notifications page.
 * - Every user's Notifications page lists all broadcasts, newest first, even without a push token.
 * - Sending runs in the background after the row is saved; the dashboard shows the counts.
 */
import { randomUUID } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, fieldBroadcasts, pushTokens, type FieldBroadcast } from "@/db/schema";
import { broadcastRoute, broadcastText, checkBroadcast, pushPreview, type BroadcastInput } from "@/lib/field-broadcast-rules";
import { BILLING_ORIGIN } from "@/lib/site-hosts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

function isExpoToken(token: string) {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/** Public page that shows a broadcast (opened in the app's in-app browser). */
export function broadcastPageUrl(id: string, lang: "en" | "ta") {
  return `${BILLING_ORIGIN}/news/${encodeURIComponent(id)}${lang === "ta" ? "?lang=ta" : ""}`;
}

/** Expo push message for one device. Exported for tests. */
export function broadcastPayload(token: string, b: Pick<FieldBroadcast, "id" | "titleEn" | "titleTa" | "bodyEn" | "bodyTa" | "imageUrl" | "linkUrl" | "videoUrl">, lang: string | null) {
  const text = broadcastText(b, lang);
  const hasMedia = !!(b.imageUrl || b.linkUrl || b.videoUrl);
  return {
    to: token,
    title: text.title.slice(0, 120),
    body: pushPreview(text.body, hasMedia, text.lang),
    sound: "default",
    priority: "high",
    // The "advice" channel exists in every published build; a new channel would be silent on old ones.
    channelId: "advice",
    data: { url: broadcastRoute(b.id), broadcastId: b.id, page: broadcastPageUrl(b.id, text.lang) },
    ...(b.imageUrl ? { richContent: { image: b.imageUrl }, mutableContent: true } : {}),
  };
}

async function deviceLanguages() {
  const tokens = await db
    .select({ token: pushTokens.token, phone: pushTokens.phone, language: pushTokens.language })
    .from(pushTokens);
  const live = tokens.filter((t) => isExpoToken(t.token));
  const unknown = [...new Set(live.filter((t) => t.language !== "en" && t.language !== "ta").map((t) => t.phone))];
  const saved = new Map<string, string>();
  for (let i = 0; i < unknown.length; i += 500) {
    const slice = unknown.slice(i, i + 500);
    const rows = await db
      .select({ phone: sql<string>`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10)`, language: customers.language })
      .from(customers)
      .where(sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) in (${sql.join(slice.map((p) => sql`${p}`), sql`, `)})`);
    for (const r of rows) if (r.language === "ta" || !saved.has(r.phone)) saved.set(r.phone, r.language === "ta" ? "ta" : "en");
  }
  return live.map((t) => ({
    token: t.token,
    language: t.language === "en" || t.language === "ta" ? t.language : saved.get(t.phone) ?? "en",
  }));
}

/** Sends a saved broadcast to every device and records the counts. Never throws. */
export async function deliverBroadcast(id: string) {
  try {
    const [b] = await db.select().from(fieldBroadcasts).where(eq(fieldBroadcasts.id, id)).limit(1);
    if (!b) return;
    const devices = await deviceLanguages();
    await db.update(fieldBroadcasts).set({ devices: devices.length }).where(eq(fieldBroadcasts.id, id));

    let delivered = 0;
    let failed = 0;
    const dead: string[] = [];
    for (let i = 0; i < devices.length; i += BATCH) {
      const batch = devices.slice(i, i + BATCH).map((d) => broadcastPayload(d.token, b, d.language));
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: Array<{ status?: string; details?: { error?: string } }>;
          errors?: Array<{ message?: string }>;
        };
        if (!res.ok || json.errors?.length || !Array.isArray(json.data)) {
          console.warn("[broadcast] Expo rejected batch", json.errors?.[0]?.message || res.status);
          failed += batch.length;
          continue;
        }
        json.data.forEach((ticket, j) => {
          if (ticket.status === "ok") delivered += 1;
          else {
            failed += 1;
            if (ticket.details?.error === "DeviceNotRegistered") dead.push(batch[j]!.to);
          }
        });
      } catch (err) {
        console.warn("[broadcast] send failed", err instanceof Error ? err.message : err);
        failed += batch.length;
      }
      await db.update(fieldBroadcasts).set({ delivered, failed }).where(eq(fieldBroadcasts.id, id));
    }
    if (dead.length) await db.delete(pushTokens).where(inArray(pushTokens.token, dead)).catch(() => undefined);
    await db
      .update(fieldBroadcasts)
      // "sent" even when no phone accepted it: the message still shows on everyone's Notifications page.
      .set({ status: "sent", delivered, failed, sentAt: new Date() })
      .where(eq(fieldBroadcasts.id, id));
  } catch (err) {
    console.warn("[broadcast] failed", err instanceof Error ? err.message : err);
    await db.update(fieldBroadcasts).set({ status: "failed", sentAt: new Date() }).where(eq(fieldBroadcasts.id, id)).catch(() => undefined);
  }
}

/** Saves the broadcast and starts sending it. Throws with the problems when it can't be sent. */
export async function createBroadcast(input: BroadcastInput, createdBy: string) {
  const { value, errors } = checkBroadcast(input);
  if (errors.length) throw new Error(errors.join(" "));
  // Guard against a double click sending the same message twice.
  const [recent] = await db
    .select({ id: fieldBroadcasts.id })
    .from(fieldBroadcasts)
    .where(sql`${fieldBroadcasts.titleEn} = ${value.titleEn} and ${fieldBroadcasts.bodyEn} = ${value.bodyEn} and ${fieldBroadcasts.createdAt} > now() - interval '2 minutes'`)
    .limit(1);
  if (recent) throw new Error("This notification was sent less than 2 minutes ago.");
  const id = randomUUID();
  await db.insert(fieldBroadcasts).values({ id, ...value, createdBy, status: "sending" });
  void deliverBroadcast(id);
  return id;
}

export async function listBroadcasts(limit = 50) {
  return db.select().from(fieldBroadcasts).orderBy(desc(fieldBroadcasts.createdAt)).limit(limit);
}

/** Broadcasts for a user's Notifications page, newest first (whether or not the push reached them). */
export async function feedBroadcasts(limit = 50) {
  return db.select().from(fieldBroadcasts).orderBy(desc(fieldBroadcasts.createdAt)).limit(limit);
}

export async function getBroadcast(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(fieldBroadcasts).where(eq(fieldBroadcasts.id, id)).limit(1);
  return row ?? null;
}

/** Number of devices a broadcast would reach now. */
export async function broadcastAudienceSize() {
  const [row] = await db
    .select({ devices: sql<number>`count(*)::int`, phones: sql<number>`count(distinct ${pushTokens.phone})::int` })
    .from(pushTokens)
    .where(sql`${pushTokens.token} like 'ExponentPushToken[%' or ${pushTokens.token} like 'ExpoPushToken[%'`);
  return { devices: Number(row?.devices ?? 0), phones: Number(row?.phones ?? 0) };
}

/** The phone's language for its feed: what the app last sent with a push token, else the farmer's. */
export async function phoneLanguage(phone: string): Promise<"en" | "ta"> {
  const [tok] = await db
    .select({ language: pushTokens.language })
    .from(pushTokens)
    .where(eq(pushTokens.phone, phone))
    .orderBy(desc(pushTokens.updatedAt))
    .limit(1);
  if (tok?.language === "ta" || tok?.language === "en") return tok.language;
  const [row] = await db
    .select({ language: customers.language })
    .from(customers)
    .where(sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) = ${phone}`)
    .limit(1);
  return row?.language === "ta" ? "ta" : "en";
}
