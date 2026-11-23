import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fieldListedProducts } from "@/db/schema";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { getFieldCatalogTree } from "@/lib/queries/field-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }
  try {
    const categories = await getFieldCatalogTree();
    // Only products switched on for the app (Product details → In app).
    const allowedRows = await db
      .select({ productId: fieldListedProducts.productId })
      .from(fieldListedProducts)
      .where(eq(fieldListedProducts.appVisible, true));
    const allowed = new Set(allowedRows.map((row) => row.productId));
    return fieldJson({
      categories: categories.map((category) => ({
        id: category.slug,
        title: category.title,
        queries: category.queries,
        iconKey: category.iconKey,
        iconUri: category.iconUri,
        subs: category.subs.map((sub) => ({
          id: sub.slug,
          title: sub.title,
          queries: sub.queries,
          match: sub.matchTerms,
          iconKey: sub.iconKey,
          iconUri: sub.iconUri,
          iconTint: sub.iconTint,
          productIds: sub.productIds.filter((id) => allowed.has(id)),
        })),
      })),
    });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Catalog failed" }, 500);
  }
}
