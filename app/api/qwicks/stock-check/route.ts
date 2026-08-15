import { NextRequest, NextResponse } from "next/server";
import { validateQwicksStockCheck } from "@/lib/queries/qwicks";
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
