import { NextRequest, NextResponse } from "next/server";
import { getQwicksInventoryPayload } from "@/lib/queries/qwicks";
import { getSettings } from "@/lib/settings";

async function verifyApiKey(req: NextRequest) {
  const settings = await getSettings();
  const configuredKey = settings.qwicksApiKey;
  if (!configuredKey) return true; // Allow if no key configured

  const reqKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!reqKey || reqKey.trim() !== configuredKey.trim()) {
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  const authorized = await verifyApiKey(req);
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid x-api-key" },
      { status: 401 }
    );
  }

  try {
    const payload = await getQwicksInventoryPayload();
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch live inventory" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
