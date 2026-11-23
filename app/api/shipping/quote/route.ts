import { NextRequest, NextResponse } from "next/server";
import { currentShippingUser } from "@/lib/shipping-guard";
import { quoteFieldDelivery } from "@/lib/field-shipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Price check for the Shipping page: the same quote the app's checkout gets, for a signed-in
 * shipping user (no app API key in the browser).
 */
export async function GET(req: NextRequest) {
  if (!(await currentShippingUser())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const pin = (req.nextUrl.searchParams.get("pin") || "").replace(/\D/g, "");
  const grams = Math.round(Number(req.nextUrl.searchParams.get("grams")));
  if (!/^[1-9]\d{5}$/.test(pin)) return NextResponse.json({ error: "Enter a 6-digit PIN code." }, { status: 400 });
  if (!Number.isFinite(grams) || grams < 1 || grams > 100_000) {
    return NextResponse.json({ error: "Enter a weight between 1 g and 100 kg." }, { status: 400 });
  }
  try {
    const quote = await quoteFieldDelivery(pin, grams);
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not price this delivery." }, { status: 400 });
  }
}
