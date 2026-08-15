import { NextRequest, NextResponse } from "next/server";
import { getQwicksInventoryPayload } from "@/lib/queries/qwicks";
import { verifyQwicksApiKey } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await context.params;
  const authorized = await verifyQwicksApiKey(req);
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
