/**
 * Product search for the Android label printer app.
 *
 * Returns only what the picker screen shows — the phone never sees pricing
 * internals, and never renders a label itself. Printing goes to
 * /api/labels/print, which returns finished printer bytes.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { verifyLabelApiKey } from "@/lib/api-auth";
import { inclusiveRate, productCode } from "@/lib/label-svg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  if (!(await verifyLabelApiKey(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || 50)
  );

  const term = `%${q}%`;
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      barcode: products.barcode,
      saleRate: products.saleRate,
      gstRate: products.gstRate,
      stockQty: products.stockQty,
    })
    .from(products)
    .where(
      q
        ? and(
            eq(products.isActive, true),
            or(
              ilike(products.name, term),
              ilike(products.sku, term),
              ilike(products.barcode, term)
            )
          )
        : eq(products.isActive, true)
    )
    .orderBy(asc(products.name))
    .limit(limit);

  return NextResponse.json(
    {
      products: rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: productCode(row),
        mrp: inclusiveRate(row.saleRate, row.gstRate).toFixed(2),
        stock: row.stockQty,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

