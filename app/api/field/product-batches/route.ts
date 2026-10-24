import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { getBatchBillingRate, inclusiveSalePrice } from "@/lib/gst";
import { searchProductBatches } from "@/lib/queries/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get("limit")) || 20));

  if (!q) {
    return fieldJson({ products: [] });
  }

  try {
    const rows = await searchProductBatches(q, limit, { onlyInStock: false });
    return fieldJson({
      products: rows.map((row) => {
        const rate = getBatchBillingRate(row, "retail");
        const gst = Number(row.gstRate) || 0;
        const price = inclusiveSalePrice(rate, gst);
        const stock = Number(row.batchId != null ? row.batchQty : row.productStockQty) || 0;
        return {
          ...row,
          rate,
          price,
          stock,
          lineKey: `${row.productId}-${row.batchId ?? "none"}`,
        };
      }),
    });
  } catch (err) {
    return fieldJson(
      { error: err instanceof Error ? err.message : "Search failed" },
      500
    );
  }
}
