import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { logLabelPrint } from "@/lib/queries/label-prints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Record a browser-direct label print (the Products page print button
 * sends bytes straight to the printer over WebUSB/Bluetooth, so the
 * server would otherwise never know a sticker fed). Session-cookie
 * authed — the browser sends its login cookie automatically, and the
 * label API key never leaves the server.
 *
 * Body: { productId?: number, labelCount: number }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const record = body as { productId?: unknown; labelCount?: unknown };
  const labelCount =
    typeof record.labelCount === "number"
      ? Math.floor(record.labelCount)
      : NaN;
  const productId =
    typeof record.productId === "number" &&
    Number.isInteger(record.productId) &&
    record.productId > 0
      ? record.productId
      : null;

  // Guard the count: the button caps a run well below this, so anything
  // larger is a bad client, not a real roll.
  if (!Number.isFinite(labelCount) || labelCount < 1 || labelCount > 2000) {
    return NextResponse.json({ error: "Invalid labelCount" }, { status: 400 });
  }

  try {
    await logLabelPrint({ productId, labelCount, source: "products-page" });
  } catch (error) {
    console.error("[labels/log] failed to record print:", error);
    return NextResponse.json(
      { error: "Could not record the print" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
