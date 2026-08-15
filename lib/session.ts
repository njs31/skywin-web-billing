/**
 * HMAC-signed session tokens. The cookie may include a role for route
 * gating, but that value is signed and cannot be forged. Authorization
 * always reloads the user from the database.
 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionPayload = {
  userId: number;
  role: string;
  exp: number;
};

function getSecret(): string {
  const secret =
    process.env.SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET or ADMIN_PASSWORD must be set");
  }
  return "skywin-dev-session-secret";
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(arr).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return toBase64Url(mac);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i)! ^ b.charCodeAt(i)!;
  }
  return out === 0;
}

export async function createSessionToken(
  userId: number,
  role: string
): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${role}.${exp}`;
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userIdStr, role, expStr, sig] = parts;
  if (!userIdStr || !role || !expStr || !sig) return null;
  if (!/^[a-z_]+$/.test(role) || role.length > 32) return null;

  const payload = `${userIdStr}.${role}.${expStr}`;
  const expected = await sign(payload);
  if (!safeEqual(sig, expected)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  const userId = Number(userIdStr);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  return { userId, role, exp };
}

export const SESSION_COOKIE = "skywin_session";
export const SESSION_MAX_AGE_SEC = SESSION_TTL_MS / 1000;
