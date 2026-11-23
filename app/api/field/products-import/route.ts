import { NextRequest, NextResponse } from "next/server";
import { requireFieldAdmin } from "@/lib/actions/auth";
import { recordActivity } from "@/lib/queries/activity-logs";
import { applyFieldProductImport, planFieldProductImport } from "@/lib/queries/field-product-excel";
import type { ProductSheetRow } from "@/lib/field-product-sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Product details → Import from Excel. A route, not a server action: a full catalogue is a few MB
 * of rows, above the server-action body limit (nginx allows 10 MB).
 * Body: { mode: "preview" | "apply", rows: ProductSheetRow[] }.
 */
export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireFieldAdmin>>;
  try {
    user = await requireFieldAdmin();
  } catch {
    return NextResponse.json({ error: "Please sign in to the dashboard again." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { mode?: string; rows?: unknown } | null;
  if (!body || !Array.isArray(body.rows)) return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  const rows = body.rows.filter((r): r is ProductSheetRow => !!r && typeof r === "object" && !Array.isArray(r));
  try {
    if (body.mode === "apply") {
      const name = user.name.trim() || user.phone;
      const result = await applyFieldProductImport(rows, { userId: user.id, userName: name });
      await recordActivity({
        action: "product.import",
        message: `${name} imported products from Excel: ${result.created} new, ${result.updated} updated, ${result.failed.length} failed`,
        entityType: "product",
        actor: { id: user.id, name },
      }).catch(() => undefined);
      const { revalidatePath } = await import("next/cache");
      for (const path of ["/field", "/field/products", "/field/catalog", "/products", "/stock"]) revalidatePath(path);
      return NextResponse.json(result);
    }
    return NextResponse.json(await planFieldProductImport(rows));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not import this file." }, { status: 400 });
  }
}
