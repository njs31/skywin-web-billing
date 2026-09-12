/**
 * Zoho Books API client — OAuth token refresh + a thin fetch wrapper.
 *
 * Auth: a Self Client (server-to-server, no user login) registered at
 * api-console.zoho.in. The four secrets below live in `.env.production` on
 * the VPS only — never in code, never in git. See the "skywin-vps-deploy"
 * memory for how to reach that file.
 *
 * Region: this org is on Zoho's India data centre — accounts host
 * `accounts.zoho.in`, API host `www.zohoapis.in`. Both are wrong for an org
 * on any other DC; don't copy this file for a non-India org without checking.
 */

const ACCOUNTS_URL = "https://accounts.zoho.in/oauth/v2/token";
const API_BASE = "https://www.zohoapis.in/books/v3";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Zoho Books integration needs ZOHO_CLIENT_ID, ` +
        `ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID in the environment.`
    );
  }
  return value;
}

export function zohoOrgId(): string {
  return requireEnv("ZOHO_ORG_ID");
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/** Refreshes the access token, reusing it until ~60s before it expires. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requireEnv("ZOHO_CLIENT_ID"),
    client_secret: requireEnv("ZOHO_CLIENT_SECRET"),
    refresh_token: requireEnv("ZOHO_REFRESH_TOKEN"),
  });

  const res = await fetch(ACCOUNTS_URL, { method: "POST", body: params });
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!res.ok || !body.access_token) {
    throw new Error(
      `Zoho token refresh failed: ${body.error ?? res.status} ${res.statusText}`
    );
  }

  cachedToken = {
    accessToken: body.access_token,
    // Refresh a minute early rather than race the real expiry.
    expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.accessToken;
}

export class ZohoApiError extends Error {
  /** Zoho's own numeric error code (0 = success; anything else is a failure
   *  even on an HTTP 200 — Zoho Books wraps errors in a 200 response body). */
  code?: number;
  /** The full parsed response body, for logging/debugging. */
  body?: unknown;

  constructor(message: string, code?: number, body?: unknown) {
    super(message);
    this.name = "ZohoApiError";
    this.code = code;
    this.body = body;
  }
}

type Query = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("organization_id", zohoOrgId());
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * One authenticated call to the Zoho Books API.
 *
 * Zoho's convention: a JSON body with `code: 0` on success, `code: <n>` (n
 * != 0) with a `message` on failure — even when the HTTP status is 200. This
 * throws `ZohoApiError` for either an HTTP-level failure or a non-zero code,
 * so callers only ever see success or a thrown error, never a silent one.
 */
export async function zohoRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: { query?: Query; body?: unknown } = {}
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ZohoApiError(
      `Zoho ${method} ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
    );
  }

  const code = typeof json.code === "number" ? json.code : undefined;
  if (!res.ok || (code !== undefined && code !== 0)) {
    throw new ZohoApiError(
      `Zoho ${method} ${path} failed: ${(json.message as string) ?? res.statusText}`,
      code,
      json
    );
  }

  return json as T;
}
