/**
 * Print-ready ESC/POS bytes for the Android label printer app.
 *
 * The phone writes the response body straight to the printer's Bluetooth
 * socket without interpreting it. Keeping the label engine here means the
 * sticker a phone prints is identical to the PNG download and the PDF sheet,
 * and a change to the label design does not need a new APK.
 */
import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { verifyLabelApiKey } from "@/lib/api-auth";
import { buildEscPosForProducts } from "@/lib/label-escpos-server";
import { DOTS_PER_MM } from "@/lib/label-print-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guard the roll: a typo should not feed hundreds of stickers. */
const MAX_PRODUCTS = 100;
const MAX_COPIES = 20;

function parseIds(value: string | null) {
  return [
    ...new Set(
      (value || "")
        .split(",")
        .map((part) => parseInt(part.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ].slice(0, MAX_PRODUCTS);
}

export async function GET(req: NextRequest) {
  if (!(await verifyLabelApiKey(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const ids = parseIds(url.searchParams.get("ids"));
  const copies = Math.min(
    MAX_COPIES,
    Math.max(1, Number(url.searchParams.get("copies")) || 1)
  );

  // Escape hatch for stock the gap sensor cannot read. Labels normally end
  // with GS FF and the printer finds the die cut itself; passing ?gap= drops
  // it back to counting dots, where image height + this gap must equal the
  // sticker pitch or labels creep.
  // Note the explicit null check: Number(null) is 0, so reading the param
  // straight through would silently turn "not specified" into "zero gap".
  const rawGap = url.searchParams.get("gap");
  const gapMm = rawGap === null || rawGap.trim() === "" ? NaN : Number(rawGap);
  const feedDots =
    Number.isFinite(gapMm) && gapMm >= 0 && gapMm <= 10
      ? Math.round(gapMm * DOTS_PER_MM)
      : undefined;

  if (ids.length === 0) {
    return NextResponse.json({ error: "No product ids given" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      saleRate: products.saleRate,
      gstRate: products.gstRate,
      expiryDate: products.expiryDate,
    })
    .from(products)
    .where(inArray(products.id, ids));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No matching products" }, { status: 404 });
  }

  // Preserve the order the app asked for, so the roll comes off predictably.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((row): row is (typeof rows)[number] => Boolean(row));

  const job = await buildEscPosForProducts(
    ordered.map((product) => ({ product, copies, feedDots }))
  );

  return new Response(job as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(job.length),
      "X-Label-Count": String(ordered.length * copies),
      "Cache-Control": "no-store",
    },
  });
}
