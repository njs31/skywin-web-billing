import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { fieldMedia } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ mime: fieldMedia.mime, data: fieldMedia.data })
    .from(fieldMedia)
    .where(eq(fieldMedia.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
