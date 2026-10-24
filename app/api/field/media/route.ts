import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { fieldMedia } from "@/db/schema";
import { requireFieldAdmin } from "@/lib/actions/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  try {
    await requireFieldAdmin();
  } catch {
    return NextResponse.json({ error: "Please sign in to the dashboard again." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image received." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Use a JPG, PNG, WebP or GIF image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 5 MB." }, { status: 400 });
  }

  const id = randomUUID();
  const data = Buffer.from(await file.arrayBuffer());
  await db.insert(fieldMedia).values({ id, mime: file.type, size: data.length, data });

  const url = new URL(`/api/field/media/${id}`, req.nextUrl.origin);
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    url.host = host;
    if (proto) url.protocol = `${proto}:`;
  }
  return NextResponse.json({ url: url.toString() });
}
