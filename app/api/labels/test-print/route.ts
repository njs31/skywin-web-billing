/**
 * Print-ready ESC/POS bytes for one diagnostic label.
 *
 * Same engine, same transport, no product needed: when nothing comes out of
 * the printer the first question is whether it is reachable at all, and a run
 * that needs a product id and a database row cannot answer that. The label
 * carries a border on the edge of the printable window, so it also shows at a
 * glance whether the artwork is landing inside the die cut.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyLabelApiKey } from "@/lib/api-auth";
import { buildEscPosJob } from "@/lib/escpos-print";
import { renderTestLabelRasterServer } from "@/lib/label-escpos-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await verifyLabelApiKey(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = buildEscPosJob([await renderTestLabelRasterServer()]);

  return new Response(job as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(job.length),
      "X-Label-Count": "1",
      "Cache-Control": "no-store",
    },
  });
}
