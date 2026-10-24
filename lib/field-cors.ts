import { NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

export function fieldCorsHeaders() {
  return corsHeaders;
}

export function fieldJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders });
}

export function fieldOptions() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
