import { NextRequest, NextResponse } from "next/server";
import { currentShippingUser } from "@/lib/shipping-guard";
import { db } from "@/db";
import { shippingRates } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getShippingProvider, setShippingProvider, type ShippingProviderMode } from "@/lib/delivery/manual-rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentShippingUser())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const provider = await getShippingProvider();
    const rates = await db
      .select()
      .from(shippingRates)
      .orderBy(asc(shippingRates.minWeightGrams), asc(shippingRates.id));

    return NextResponse.json({
      provider,
      rates: rates.map((r) => ({
        id: r.id,
        slab: r.slab,
        minWeightGrams: r.minWeightGrams,
        maxWeightGrams: r.maxWeightGrams,
        zoneName: r.zoneName,
        regions: r.regions,
        transitDays: r.transitDays,
        shippingFee: Number(r.shippingFee),
        pincodes: r.pincodes || "",
        districts: r.districts || "",
        states: r.states || "",
        isActive: r.isActive,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load rates" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await currentShippingUser())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const body = (await req.json()) as {
      action?: "create" | "update" | "delete" | "toggle" | "switch_provider" | "reseed";
      provider?: ShippingProviderMode;
      rate?: {
        id?: number;
        slab: string;
        minWeightGrams: number;
        maxWeightGrams: number;
        zoneName: string;
        regions: string;
        transitDays: string;
        shippingFee: number;
        pincodes?: string;
        districts?: string;
        states?: string;
        isActive?: boolean;
      };
      rateId?: number;
    };

    if (body.action === "switch_provider" && body.provider) {
      const switched = await setShippingProvider(body.provider, "Shipping Portal");
      return NextResponse.json(switched);
    }

    if (body.action === "delete" && body.rateId) {
      await db.delete(shippingRates).where(eq(shippingRates.id, body.rateId));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "toggle" && body.rateId != null) {
      const [current] = await db
        .select({ isActive: shippingRates.isActive })
        .from(shippingRates)
        .where(eq(shippingRates.id, body.rateId))
        .limit(1);

      if (current) {
        await db
          .update(shippingRates)
          .set({ isActive: !current.isActive, updatedAt: new Date() })
          .where(eq(shippingRates.id, body.rateId));
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update" && body.rate?.id) {
      const r = body.rate;
      const rateId = Number(r.id);
      if (!rateId) return NextResponse.json({ error: "Missing rate id" }, { status: 400 });
      await db
        .update(shippingRates)
        .set({
          slab: r.slab,
          minWeightGrams: Number(r.minWeightGrams) || 0,
          maxWeightGrams: Number(r.maxWeightGrams) || 1000,
          zoneName: r.zoneName,
          regions: r.regions,
          transitDays: r.transitDays,
          shippingFee: String(Number(r.shippingFee) || 0),
          pincodes: r.pincodes || "",
          districts: r.districts || "",
          states: r.states || "",
          isActive: r.isActive !== false,
          updatedAt: new Date(),
        })
        .where(eq(shippingRates.id, rateId));

      return NextResponse.json({ ok: true });
    }

    if (body.action === "create" && body.rate) {
      const r = body.rate;
      const [created] = await db
        .insert(shippingRates)
        .values({
          slab: r.slab,
          minWeightGrams: Number(r.minWeightGrams) || 0,
          maxWeightGrams: Number(r.maxWeightGrams) || 1000,
          zoneName: r.zoneName,
          regions: r.regions,
          transitDays: r.transitDays || "3 - 5 Days",
          shippingFee: String(Number(r.shippingFee) || 0),
          pincodes: r.pincodes || "",
          districts: r.districts || "",
          states: r.states || "",
          isActive: r.isActive !== false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return NextResponse.json({ ok: true, rate: created });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[api/shipping/rates] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Operation failed" },
      { status: 400 }
    );
  }
}
