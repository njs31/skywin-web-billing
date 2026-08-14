import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getWidgetPayload } from "@/lib/queries/widget";

function requestApiKey(req: NextRequest) {
  const headerKey = req.headers.get("x-api-key");
  if (headerKey?.trim()) return headerKey.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

async function verifyWidgetApiKey(req: NextRequest) {
  const reqKey = requestApiKey(req);
  if (!reqKey) return false;

  const settings = await getSettings();
  const valid = [settings.widgetApiKey, settings.qwicksApiKey]
    .map((k) => k?.trim())
    .filter(Boolean);
  if (valid.length === 0) return false;
  return valid.includes(reqKey);
}

export async function GET(req: NextRequest) {
  const authorized = await verifyWidgetApiKey(req);
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid x-api-key" },
      { status: 401 }
    );
  }

  try {
    const payload = await getWidgetPayload();
    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load widget data",
      },
      { status: 500 }
    );
  }
}
