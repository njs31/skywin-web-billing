import { NextRequest, NextResponse } from "next/server";
import { getWidgetPayload } from "@/lib/queries/widget";
import { verifyWidgetApiKey } from "@/lib/api-auth";

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
