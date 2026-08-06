import { NextRequest, NextResponse } from "next/server";
import { getQwicksInventoryPayload } from "@/lib/queries/qwicks";
import { getSettings } from "@/lib/settings";

async function verifyApiKey(req: NextRequest) {
  const settings = await getSettings();
  const configuredKey = settings.qwicksApiKey;
  if (!configuredKey) return true;

  const reqKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!reqKey || reqKey.trim() !== configuredKey.trim()) {
    return false;
  }
  return true;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await context.params;
  const authorized = await verifyApiKey(req);
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid x-api-key" },
      { status: 401 }
    );
  }

  try {
    const payload = await getQwicksInventoryPayload();
    return NextResponse.json(
      {
        ...payload,
        merchantId,
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch live inventory" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ merchantId: string }> }
) {
  return GET(req, context);
}
