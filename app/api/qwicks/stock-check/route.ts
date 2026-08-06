import { NextRequest, NextResponse } from "next/server";
import { validateQwicksStockCheck } from "@/lib/queries/qwicks";
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

export async function POST(req: NextRequest) {
  const authorized = await verifyApiKey(req);
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid x-api-key" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const result = await validateQwicksStockCheck(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        canPlaceOrder: false,
        message: err instanceof Error ? err.message : "Stock validation failed",
      },
      { status: 400 }
    );
  }
}
