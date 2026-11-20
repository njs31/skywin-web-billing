import { db } from "@/db";
import { orderCheckpoints, orderNotifications, pushTokens, sales, customers } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { SHIPPING_CHECKPOINTS, type ShippingCheckpoint } from "@/lib/delivery/manual-rates";

/**
 * Dispatch an Expo push notification to a device token.
 */
export async function sendExpoPushNotification({
  token,
  title,
  body,
  data,
}: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  if (!token || !token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[")) {
    console.warn(`[push] Skipping invalid Expo push token: ${token}`);
    return { ok: false, error: "Invalid token" };
  }

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        sound: "default",
        title,
        body,
        data: data || {},
        priority: "high",
        channelId: "orders",
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      data?: { status?: string; message?: string; details?: unknown };
      errors?: Array<{ message: string }>;
    };

    if (!res.ok || json.errors?.length) {
      const errMsg = json.errors?.[0]?.message || "Expo push error";
      console.warn(`[push] Expo notification warning: ${errMsg}`);
      return { ok: false, error: errMsg };
    }

    return { ok: true, data: json.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    console.error("[push] Failed to send Expo push:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Register or update an Expo push token for a user/farmer phone number.
 */
export async function registerPushToken(phone: string, token: string, platform: string = "android") {
  const cleanPhone = phone.replace(/\D/g, "").slice(-10);
  const cleanToken = token.trim();
  if (!cleanPhone || !cleanToken) {
    return { ok: false, error: "Phone and token are required" };
  }

  try {
    await db
      .insert(pushTokens)
      .values({
        phone: cleanPhone,
        token: cleanToken,
        platform,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: {
          phone: cleanPhone,
          platform,
          updatedAt: new Date(),
        },
      });

    return { ok: true };
  } catch (err) {
    console.error("[registerPushToken] error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save push token" };
  }
}

/**
 * Checkpoint descriptions for human-friendly notifications
 */
function getCheckpointNotificationText(orderId: string, checkpoint: ShippingCheckpoint) {
  switch (checkpoint) {
    case "Order Received":
      return {
        title: `Order Received · ${orderId}`,
        body: `Your order ${orderId} has been received and confirmed by SkyWin.`,
      };
    case "Order Processing":
      return {
        title: `Order Processing · ${orderId}`,
        body: `Your order ${orderId} is being packed and prepared for dispatch.`,
      };
    case "Dispatched":
      return {
        title: `Order Dispatched · ${orderId}`,
        body: `Your order ${orderId} has been dispatched from SkyWin warehouse.`,
      };
    case "In transit":
      return {
        title: `In Transit · ${orderId}`,
        body: `Your package for order ${orderId} is currently in transit to your area.`,
      };
    case "Out for delivery":
      return {
        title: `Out for Delivery · ${orderId}`,
        body: `Your order ${orderId} is out for delivery today! Keep your phone reachable.`,
      };
    case "Delivered":
      return {
        title: `Order Delivered · ${orderId}`,
        body: `Your order ${orderId} has been delivered successfully. Thank you for choosing SkyWin!`,
      };
    case "Refunded":
      return {
        title: `Order Refunded · ${orderId}`,
        body: `Refund for order ${orderId} has been processed back to your original payment method.`,
      };
    case "Order Cancelled":
      return {
        title: `Order Cancelled · ${orderId}`,
        body: `Your order ${orderId} has been cancelled. Please contact support for any questions.`,
      };
    default:
      return {
        title: `Order Update · ${orderId}`,
        body: `Your order ${orderId} status has been updated to ${checkpoint}.`,
      };
  }
}

/**
 * Record a new checkpoint for an order, update sales record,
 * and dispatch push notifications to relevant mobile devices.
 */
export async function recordOrderCheckpoint(input: {
  orderId: string;
  saleId?: number;
  checkpoint: ShippingCheckpoint;
  note?: string;
  location?: string;
  updatedBy?: string;
}) {
  const orderId = input.orderId.trim();
  const checkpoint = input.checkpoint;
  if (!orderId || !checkpoint) {
    throw new Error("orderId and checkpoint are required.");
  }

  // 1. Find corresponding sale row
  const [sale] = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      notes: sales.notes,
      customerId: sales.customerId,
      customerName: sales.customerName,
      status: sales.status,
    })
    .from(sales)
    .where(eq(sales.externalOrderId, orderId))
    .limit(1);

  const saleId = input.saleId || sale?.id;

  // 2. Insert into order_checkpoints
  const [cp] = await db
    .insert(orderCheckpoints)
    .values({
      orderId,
      saleId: saleId || null,
      checkpoint,
      note: input.note || null,
      location: input.location || null,
      updatedBy: input.updatedBy || "shipping-office",
      createdAt: new Date(),
    })
    .returning();

  // 3. Update sales record status/notes
  if (saleId) {
    const updates: Record<string, unknown> = {
      deliveryNote: checkpoint,
      transporterName: "SkyWin Delivery",
    };

    if (checkpoint === "Order Cancelled") {
      updates.status = "cancelled";
      updates.cancelledAt = new Date();
      updates.cancelledBy = input.updatedBy || "Shipping Office";
      updates.cancelReason = input.note || "Cancelled from Shipping Portal";
    }

    if (input.location) {
      updates.destination = input.location;
    }

    await db.update(sales).set(updates).where(eq(sales.id, saleId));
  }

  // 4. Send Push Notification & save in in-app notification feed
  let targetPhone = "";
  if (sale?.customerId) {
    const [cust] = await db
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, sale.customerId))
      .limit(1);
    if (cust?.phone) {
      targetPhone = cust.phone.replace(/\D/g, "").slice(-10);
    }
  }

  const notifCopy = getCheckpointNotificationText(orderId, checkpoint);
  const notifId = `cp-${randomUUID()}`;

  // Save to in-app notification history
  await db.insert(orderNotifications).values({
    id: notifId,
    orderId,
    phone: targetPhone || null,
    title: notifCopy.title,
    body: notifCopy.body,
    checkpoint,
    read: false,
    createdAt: new Date(),
  });

  // Find all push tokens for this customer phone (or recent tokens)
  if (targetPhone) {
    const tokens = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.phone, targetPhone));

    for (const t of tokens) {
      void sendExpoPushNotification({
        token: t.token,
        title: notifCopy.title,
        body: notifCopy.body,
        data: {
          orderId,
          checkpoint,
          notificationId: notifId,
        },
      });
    }
  }

  return {
    success: true,
    checkpoint: cp,
    notification: notifCopy,
  };
}

/**
 * Get full checkpoint history and tracking details for an order.
 */
export async function getOrderTrackingDetails(orderId: string) {
  const id = orderId.trim();
  if (!id) throw new Error("Order ID is required");

  // Fetch checkpoints in chronological order
  const checkpoints = await db
    .select()
    .from(orderCheckpoints)
    .where(eq(orderCheckpoints.orderId, id))
    .orderBy(desc(orderCheckpoints.createdAt));

  const [sale] = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      customerName: sales.customerName,
      status: sales.status,
      deliveryNote: sales.deliveryNote,
      transporterName: sales.transporterName,
      destination: sales.destination,
      grandTotal: sales.grandTotal,
    })
    .from(sales)
    .where(eq(sales.externalOrderId, id))
    .limit(1);

  const latestCp = checkpoints[0]?.checkpoint || (sale?.status === "cancelled" ? "Order Cancelled" : "Order Received");

  return {
    orderId: id,
    invoiceNo: sale?.invoiceNo || null,
    currentStatus: latestCp,
    courier: sale?.transporterName || "SkyWin Delivery",
    location: sale?.destination || "",
    lastUpdated: checkpoints[0]?.createdAt?.toISOString() || sale?.date?.toISOString() || new Date().toISOString(),
    history: checkpoints.map((cp) => ({
      id: cp.id,
      checkpoint: cp.checkpoint,
      note: cp.note,
      location: cp.location,
      updatedBy: cp.updatedBy,
      createdAt: cp.createdAt.toISOString(),
    })),
  };
}
