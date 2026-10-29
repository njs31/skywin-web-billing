import { NextRequest } from "next/server";
import { verifyFieldApiKey } from "@/lib/api-auth";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import { publicFieldProductDetail } from "@/lib/queries/field-product-details";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyFieldApiKey(req))) {
    return fieldJson({ error: "Unauthorized" }, 401);
  }
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) return fieldJson({ error: "Bad id" }, 400);
  try {
    const detail = await publicFieldProductDetail(productId);
    if (!detail) return fieldJson({ error: "Not found" }, 404);
    return fieldJson({ product: detail });
  } catch (err) {
    return fieldJson({ error: err instanceof Error ? err.message : "Detail failed" }, 500);
  }
}
