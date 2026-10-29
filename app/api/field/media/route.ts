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

  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const rawHost = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(",")[0]
    .trim();
  const hostname = rawHost.replace(/:\d+$/, "");
  const port = rawHost.match(/:(\d+)$/)?.[1];
  const keepPort =
    !!port &&
    port !== "3000" &&
    !((proto === "https" && port === "443") || (proto === "http" && port === "80"));
  const url = `${proto}://${hostname}${keepPort ? `:${port}` : ""}/api/field/media/${id}`;
  return NextResponse.json({ url });
}
