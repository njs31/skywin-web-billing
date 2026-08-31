import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";

function keysMatch(provided: string, expected: string) {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function requestApiKey(req: NextRequest) {
  const headerKey = req.headers.get("x-api-key");
  if (headerKey?.trim()) return headerKey.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

/** Fail closed: missing configured key means deny, not allow. */
export async function verifyConfiguredApiKey(
  req: NextRequest,
  keys: Array<string | undefined | null>
) {
  const provided = requestApiKey(req);
  if (!provided) return false;
  const valid = keys.map((k) => k?.trim()).filter((k): k is string => Boolean(k));
  if (valid.length === 0) return false;
  return valid.some((k) => keysMatch(provided, k));
}

export async function verifyQwicksApiKey(req: NextRequest) {
  const settings = await getSettings();
  return verifyConfiguredApiKey(req, [settings.qwicksApiKey]);
}

export async function verifyWidgetApiKey(req: NextRequest) {
  const settings = await getSettings();
  return verifyConfiguredApiKey(req, [
    settings.widgetApiKey,
    settings.qwicksApiKey,
  ]);
}

/** Key for the Android label printer app. */
export async function verifyLabelApiKey(req: NextRequest) {
  const settings = await getSettings();
  return verifyConfiguredApiKey(req, [settings.labelApiKey]);
}
