/**
 * Push notifications to the SkyWin Field app (iOS and Android, through Expo's push service).
 *
 * - Sends to every device registered for a phone, in batches of 100.
 * - Removes tokens Expo reports as DeviceNotRegistered (app uninstalled or signed out).
 * - Each phone gets Tamil or English: the app's language on that phone, else the farmer's saved one.
 * - Every message is also saved to the phone's in-app notification feed (unless feed: false).
 * - Never throws: a failed push must not fail the order, refund or save that triggered it.
 */
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, orderNotifications, pushTokens, sales, users } from "@/db/schema";

export type PushChannel = "orders" | "advice" | "team";

export type PushMessage = {
  title: string;
  body: string;
  /** In-app route opened on tap, e.g. /order/SW-123. */
  url?: string;
  orderId?: string;
  channel?: PushChannel;
  /** Saved to the in-app notification feed unless false (e.g. the caller already saved it). */
  feed?: boolean;
  checkpoint?: string;
};

export type Bilingual = { en: PushMessage; ta?: PushMessage };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function mobile10(phone: string | null | undefined) {
  return String(phone ?? "").replace(/\D/g, "").slice(-10);
}

function isExpoToken(token: string) {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/** Builds Expo push payloads. Exported for tests. */
export function expoPayloads(tokens: string[], msg: PushMessage) {
  return tokens.filter(isExpoToken).map((to) => ({
    to,
    title: msg.title.slice(0, 120),
    body: msg.body.slice(0, 400),
    sound: "default",
    priority: "high",
    channelId: msg.channel || "orders",
    data: { url: msg.url, orderId: msg.orderId, checkpoint: msg.checkpoint },
  }));
}

async function sendToTokens(tokens: string[], msg: PushMessage) {
  const payloads = expoPayloads(tokens, msg);
  const dead: string[] = [];
  for (let i = 0; i < payloads.length; i += 100) {
    const batch = payloads.slice(i, i + 100);
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
      if (!res.ok || json.errors?.length) {
        console.warn("[push] Expo rejected batch", json.errors?.[0]?.message || res.status);
        continue;
      }
      json.data?.forEach((ticket, j) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") dead.push(batch[j]!.to);
      });
    } catch (err) {
      console.warn("[push] send failed", err instanceof Error ? err.message : err);
    }
  }
  if (dead.length) {
    await db.delete(pushTokens).where(inArray(pushTokens.token, dead)).catch(() => undefined);
  }
}

async function farmerLanguage(phone: string): Promise<"en" | "ta"> {
  const [row] = await db
    .select({ language: customers.language })
    .from(customers)
    .where(sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) = ${phone}`)
    .limit(1);
  return row?.language === "ta" ? "ta" : "en";
}

/** Sends one message to each phone (in the farmer's language when a Tamil copy is given). */
export async function notifyPhones(phones: Array<string | null | undefined>, message: Bilingual) {
  try {
    const unique = [...new Set(phones.map(mobile10).filter((p) => p.length === 10))];
    if (!unique.length) return;
    const rows = await db
      .select({ phone: pushTokens.phone, token: pushTokens.token, language: pushTokens.language, updatedAt: pushTokens.updatedAt })
      .from(pushTokens)
      .where(inArray(pushTokens.phone, unique));

    for (const phone of unique) {
      // The app's language on the phone (sent with its push token) wins; else the farmer's saved one.
      const appLanguage = rows
        .filter((r) => r.phone === phone && (r.language === "en" || r.language === "ta"))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.language;
      const lang = appLanguage ?? (message.ta ? await farmerLanguage(phone) : "en");
      const msg = message.ta && lang === "ta" ? message.ta : message.en;
      if (msg.feed !== false) {
        await db
          .insert(orderNotifications)
          .values({
            id: `push-${randomUUID()}`,
            orderId: msg.orderId || null,
            phone,
            title: msg.title,
            body: msg.body,
            url: msg.url || (msg.orderId ? `/order/${msg.orderId}` : null),
            checkpoint: msg.checkpoint || null,
            read: false,
            createdAt: new Date(),
          })
          .catch(() => undefined);
      }
      const tokens = rows.filter((r) => r.phone === phone).map((r) => r.token);
      if (tokens.length) await sendToTokens(tokens, msg);
    }
  } catch (err) {
    console.warn("[push] notifyPhones failed", err instanceof Error ? err.message : err);
  }
}

/** Fire and forget, so the request that triggered it returns at once. */
export function notifyLater(phones: Array<string | null | undefined>, message: Bilingual) {
  void notifyPhones(phones, message);
}

/** Phone of the field officer a farmer is assigned to, if any. */
export async function officerPhoneForCustomer(customerId: number | null | undefined) {
  if (!customerId) return null;
  const [row] = await db
    .select({ phone: users.phone })
    .from(customers)
    .innerJoin(users, eq(users.id, customers.assignedOfficerId))
    .where(eq(customers.id, customerId))
    .limit(1);
  return row?.phone ? mobile10(row.phone) : null;
}

/** Farmer phone, name and assigned officer phone for a sale. */
export async function peopleForSale(where: { saleId?: number; orderId?: string }) {
  const condition = where.saleId ? eq(sales.id, where.saleId) : eq(sales.externalOrderId, where.orderId || "");
  const [row] = await db
    .select({
      saleId: sales.id,
      orderId: sales.externalOrderId,
      invoiceNo: sales.invoiceNo,
      customerId: sales.customerId,
      farmerName: customers.name,
      farmerPhone: customers.phone,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(condition)
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    farmerPhone: mobile10(row.farmerPhone),
    officerPhone: await officerPhoneForCustomer(row.customerId),
    ref: row.orderId || row.invoiceNo || `#${row.saleId}`,
  };
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// ---- Messages ------------------------------------------------------------------------------

export const pushCopy = {
  orderPlacedForFarmer(orderId: string, amount: number): Bilingual {
    return {
      en: {
        title: `Order confirmed · ${orderId}`,
        body: `${rupees(amount)} paid. We will tell you when it ships.`,
        url: `/order/${orderId}`,
        orderId,
        feed: true,
      },
      ta: {
        title: `ஆர்டர் உறுதி · ${orderId}`,
        body: `${rupees(amount)} செலுத்தப்பட்டது. அனுப்பியதும் தெரிவிப்போம்.`,
        url: `/order/${orderId}`,
        orderId,
        feed: true,
      },
    };
  },
  orderPlacedForOfficer(orderId: string, farmer: string, amount: number): Bilingual {
    return {
      en: {
        title: `New order · ${farmer}`,
        body: `${orderId} · ${rupees(amount)} paid.`,
        url: `/order/${orderId}`,
        orderId,
        channel: "team",
      },
    };
  },
  orderUpdateForOfficer(orderId: string, farmer: string, status: string): Bilingual {
    return {
      en: {
        title: `${status} · ${farmer}`,
        body: `Order ${orderId} is now ${status.toLowerCase()}.`,
        url: `/order/${orderId}`,
        orderId,
        channel: "team",
      },
    };
  },
  refundForFarmer(orderId: string, amount: number): Bilingual {
    return {
      en: {
        title: `Refund sent · ${orderId}`,
        body: `${rupees(amount)} is on its way to your UPI account. It can take 5–7 days.`,
        url: `/order/${orderId}`,
        orderId,
        feed: true,
        checkpoint: "Refunded",
      },
      ta: {
        title: `பணம் திருப்பி அனுப்பப்பட்டது · ${orderId}`,
        body: `${rupees(amount)} உங்கள் UPI கணக்குக்கு வரும். 5–7 நாட்கள் ஆகலாம்.`,
        url: `/order/${orderId}`,
        orderId,
        feed: true,
        checkpoint: "Refunded",
      },
    };
  },
  newAdviceForFarmer(crop: string, problem: string): Bilingual {
    const what = [crop, problem].filter(Boolean).join(" · ");
    return {
      en: { title: "New advice from your field officer", body: what || "Open the app to see the products to use.", url: "/recommendations", channel: "advice" },
      ta: { title: "உங்கள் கள அலுவலரின் புதிய ஆலோசனை", body: what || "பயன்படுத்த வேண்டிய பொருட்களை ஆப்பில் பாருங்கள்.", url: "/recommendations", channel: "advice" },
    };
  },
  newFarmerForOfficer(name: string, village: string, farmerId: number): Bilingual {
    return {
      en: {
        title: "New farmer in your area",
        body: [name, village].filter(Boolean).join(" · "),
        url: `/farmer/${farmerId}`,
        channel: "team",
      },
    };
  },
};

/** Shipping status messages for farmers, in both languages. */
export function checkpointCopy(orderId: string, checkpoint: string): Bilingual {
  const en: Record<string, [string, string]> = {
    "Order Received": ["Order received", "SkyWin has received your order."],
    "Order Processing": ["Order being packed", "Your order is being packed for dispatch."],
    Dispatched: ["Order dispatched", "Your order has left the SkyWin warehouse."],
    "In transit": ["On the way", "Your order is on its way to your area."],
    "Out for delivery": ["Out for delivery today", "Keep your phone reachable for the delivery."],
    Delivered: ["Delivered", "Your order has been delivered. Thank you for choosing SkyWin."],
    Refunded: ["Refund processed", "Your money is on its way back to your UPI account."],
    "Order Cancelled": ["Order cancelled", "Your order was cancelled. Any payment will be refunded."],
  };
  const ta: Record<string, [string, string]> = {
    "Order Received": ["ஆர்டர் பெறப்பட்டது", "உங்கள் ஆர்டர் SkyWin க்கு கிடைத்தது."],
    "Order Processing": ["ஆர்டர் தயாராகிறது", "உங்கள் ஆர்டர் அனுப்புவதற்காக பொதி செய்யப்படுகிறது."],
    Dispatched: ["ஆர்டர் அனுப்பப்பட்டது", "உங்கள் ஆர்டர் SkyWin கிடங்கிலிருந்து புறப்பட்டது."],
    "In transit": ["வழியில் உள்ளது", "உங்கள் ஆர்டர் உங்கள் பகுதிக்கு வந்துகொண்டிருக்கிறது."],
    "Out for delivery": ["இன்று டெலிவரி", "டெலிவரிக்காக உங்கள் போனை அருகில் வைத்திருங்கள்."],
    Delivered: ["டெலிவரி ஆனது", "உங்கள் ஆர்டர் வழங்கப்பட்டது. SkyWin ஐ தேர்ந்தெடுத்ததற்கு நன்றி."],
    Refunded: ["பணம் திருப்பி அனுப்பப்பட்டது", "உங்கள் பணம் UPI கணக்குக்கு திரும்ப வருகிறது."],
    "Order Cancelled": ["ஆர்டர் ரத்து", "உங்கள் ஆர்டர் ரத்து செய்யப்பட்டது. செலுத்திய பணம் திருப்பி அனுப்பப்படும்."],
  };
  const [enTitle, enBody] = en[checkpoint] ?? ["Order update", `Your order is now: ${checkpoint}.`];
  const [taTitle, taBody] = ta[checkpoint] ?? ["ஆர்டர் நிலை", `உங்கள் ஆர்டர் நிலை: ${checkpoint}.`];
  // The checkpoint service saves its own feed row for the farmer, so don't save it twice.
  const base = { url: `/order/${orderId}`, orderId, checkpoint, channel: "orders" as const, feed: false };
  return {
    en: { ...base, title: `${enTitle} · ${orderId}`, body: enBody },
    ta: { ...base, title: `${taTitle} · ${orderId}`, body: taBody },
  };
}
