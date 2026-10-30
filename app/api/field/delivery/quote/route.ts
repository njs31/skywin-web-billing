import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { chargeableGramsForItems } from "@/lib/field-listed";
import { quoteDelhivery } from "@/lib/delivery/delhivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) return fieldJson({ error: "Unauthorized" }, 401);
  try {
    const pin = req.nextUrl.searchParams.get("pin") || "";
    const items = parseQuoteItems(req.nextUrl.searchParams.get("items") || "");
    const grams = items.length
      ? await chargeableGramsForItems(items)
      : Math.max(100, Math.round((Number(req.nextUrl.searchParams.get("kg")) || 1) * 1000));
    return fieldJson(await quoteDelhivery(pin, grams));
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Quote failed" }, 400);
  }
}

function parseQuoteItems(raw: string) {
  const items: Array<{ productId: number; qty: number }> = [];
  for (const part of raw.split(",")) {
    if (!part) continue;
    const [idRaw, qtyRaw] = part.split(":");
    const productId = Number(idRaw);
    const qty = Number(qtyRaw);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    if (!Number.isFinite(qty) || qty <= 0 || qty > 999) continue;
    items.push({ productId, qty });
    if (items.length >= 40) break;
  }
  return items;
}
