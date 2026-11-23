import { NextRequest, NextResponse } from "next/server";
import { currentShippingUser } from "@/lib/shipping-guard";
import { recordOrderCheckpoint, getOrderTrackingDetails } from "@/lib/services/shipping-checkpoints";
import { type ShippingCheckpoint } from "@/lib/delivery/manual-rates";
import { isDeliveryStep } from "@/lib/order-status";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await currentShippingUser())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const orderId = req.nextUrl.searchParams.get("orderId") || "";
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }
    const details = await getOrderTrackingDetails(orderId);
    return NextResponse.json(details);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load tracking details" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await currentShippingUser())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const body = (await req.json()) as {
      orderId?: string;
      saleId?: number;
      checkpoint?: ShippingCheckpoint;
      note?: string;
      location?: string;
      updatedBy?: string;
    };

    const orderId = String(body.orderId || "");
    const checkpoint = body.checkpoint as ShippingCheckpoint;

    if (!orderId || !checkpoint) {
      return NextResponse.json(
        { error: "orderId and checkpoint are required" },
        { status: 400 }
      );
    }
    // Only delivery steps are set here. Cancelling or refunding must go through Orders, which
    // sends the money back through Razorpay and returns the stock; a label alone would not.
    if (!isDeliveryStep(checkpoint)) {
      return NextResponse.json(
        { error: "Cancel or refund this order from Orders, so the farmer gets the money back." },
        { status: 400 }
      );
    }
    if (body.saleId) {
      const [sale] = await db.select({ status: sales.status }).from(sales).where(eq(sales.id, Number(body.saleId))).limit(1);
      if (sale?.status === "cancelled") {
        return NextResponse.json({ error: "This order is cancelled, so it cannot be shipped." }, { status: 400 });
      }
    }

    const result = await recordOrderCheckpoint({
      orderId,
      saleId: body.saleId ? Number(body.saleId) : undefined,
      checkpoint,
      note: body.note,
      location: body.location,
      updatedBy: body.updatedBy || "Shipping Office",
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/shipping/status] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record checkpoint" },
      { status: 400 }
    );
  }
}
