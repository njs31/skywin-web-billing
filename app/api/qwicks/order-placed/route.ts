import { NextRequest, NextResponse } from "next/server";
import { processQwicksOrderPlaced } from "@/lib/queries/qwicks";
import { verifyQwicksApiKey } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const authorized = await verifyQwicksApiKey(req);
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid x-api-key" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const result = await processQwicksOrderPlaced(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to process order",
      },
      { status: 400 }
    );
  }
}
