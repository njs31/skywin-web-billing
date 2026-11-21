import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { fieldIdentity, legacyFieldKeyAllowed } from "@/lib/field-auth";

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

/**
 * Field app access: a signed login token (after a server-checked WhatsApp OTP), or, while
 * FIELD_LEGACY_KEY is not "off", the shared app key that older app builds still send.
 * Routes that act for a person use `fieldIdentity(req)` to get who is signed in.
 */
export async function verifyFieldApiKey(req: NextRequest) {
  if (fieldIdentity(req)) return true;
  if (!legacyFieldKeyAllowed()) return false;
  const settings = await getSettings();
  return verifyConfiguredApiKey(req, [
    settings.fieldApiKey || DEFAULT_SETTINGS.fieldApiKey,
    settings.qwicksApiKey || DEFAULT_SETTINGS.qwicksApiKey,
  ]);
}
