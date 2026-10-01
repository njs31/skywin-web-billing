/**
 * Minimal WhiteBooks e-Invoice client.
 *
 * Two-step flow per their developer docs: `GET /einvoice/authenticate`
 * returns a one-hour IRP AuthToken, which every later call sends back as
 * the `auth-token` header. WhiteBooks accepts the plain NIC JSON and
 * handles IRP encryption itself, so this client never touches the Sek.
 */
import {
  assertWhitebooksConfigured,
  type WhitebooksConfig,
} from "./config";

export class WhitebooksError extends Error {
  readonly code: string | undefined;
  readonly httpStatus: number;
  constructor(message: string, code?: string, httpStatus = 0) {
    super(message);
    this.name = "WhitebooksError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type AuthData = {
  AuthToken?: string;
  TokenExpiry?: string;
};

/** In-memory token; re-authenticates a few minutes before expiry. */
let cached: { token: string; expiresAtMs: number } | null = null;

function commonHeaders(cfg: WhitebooksConfig): Record<string, string> {
  return {
    username: cfg.gstUsername,
    password: cfg.gstPassword,
    ip_address: cfg.ipAddress,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    gstin: cfg.gstin,
  };
}

function withEmail(cfg: WhitebooksConfig, path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${cfg.baseUrl}${path}${sep}email=${encodeURIComponent(cfg.email)}`;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to the raw-body error below.
  }
  throw new WhitebooksError(
    `WhiteBooks returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`,
    undefined,
    res.status
  );
}

function throwIfFailed(
  body: Record<string, unknown>,
  httpStatus: number,
  action: string
): asserts body is Record<string, unknown> & { data: unknown } {
  if (String(body.status_cd) === "1") return;
  const code =
    typeof body.errorCode === "string" ? body.errorCode : undefined;
  const desc =
    typeof body.status_desc === "string"
      ? body.status_desc
      : `Unknown failure (HTTP ${httpStatus})`;
  throw new WhitebooksError(
    `${action} failed: ${desc}`,
    code,
    httpStatus
  );
}

async function authenticate(cfg: WhitebooksConfig): Promise<{
  token: string;
  expiresAtMs: number;
}> {
  const res = await fetch(withEmail(cfg, "/einvoice/authenticate"), {
    method: "GET",
    headers: commonHeaders(cfg),
  });
  const body = await readJson(res);
  throwIfFailed(body, res.status, "IRP authentication");
  const data = body.data as AuthData;
  if (!data?.AuthToken) {
    throw new WhitebooksError(
      "IRP authentication returned no AuthToken",
      undefined,
      res.status
    );
  }
  // "YYYY-MM-DD HH:mm:ss" parses in server-local time; the VPS runs UTC,
  // so an IST timestamp reads ~5.5h early — a safe direction that only
  // re-authenticates sooner, never after real expiry.
  const parsed = Date.parse((data.TokenExpiry ?? "").replace(" ", "T"));
  const expiresAtMs =
    (Number.isFinite(parsed) ? parsed : Date.now() + 3600_000) - 5 * 60_000;
  return { token: data.AuthToken, expiresAtMs };
}

/** A cached IRP auth token, refreshing when close to expiry. */
export async function getAuthToken(
  cfg: WhitebooksConfig
): Promise<string> {
  assertWhitebooksConfigured(cfg);
  if (cached && cached.expiresAtMs > Date.now()) return cached.token;
  cached = await authenticate(cfg);
  return cached.token;
}

export type IrnSuccessData = {
  Irn?: string;
  AckNo?: number | string;
  AckDt?: string;
  SignedInvoice?: string;
  SignedQRCode?: string;
  EwbNo?: number | string;
  EwbDt?: string;
  EwbValidTill?: string;
  [key: string]: unknown;
};

async function postWhitebooks(
  cfg: WhitebooksConfig,
  path: string,
  body: Record<string, unknown>,
  action: string
): Promise<Record<string, unknown>> {
  const token = await getAuthToken(cfg);
  const res = await fetch(withEmail(cfg, path), {
    method: "POST",
    headers: {
      ...commonHeaders(cfg),
      "auth-token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const responseBody = await readJson(res);
  // A stale cached token surfaces as 401 — clear it so the next call
  // re-authenticates instead of retrying with the same dead token.
  if (res.status === 401) cached = null;
  throwIfFailed(responseBody, res.status, action);
  return responseBody;
}

/**
 * Push one invoice JSON to the IRP. `payload` is the NIC v1.03 document
 * built by `buildIrnPayload` — passed through verbatim.
 */
export async function generateIrn(
  cfg: WhitebooksConfig,
  payload: Record<string, unknown>
): Promise<IrnSuccessData> {
  const body = await postWhitebooks(
    cfg,
    "/einvoice/type/GENERATE/version/V1_03",
    payload,
    "IRN generation"
  );
  return (body.data ?? {}) as IrnSuccessData;
}

/**
 * Cancel a pushed IRN. Reason codes: 1 Duplicate, 2 Data entry mistake,
 * 3 Order cancelled, 4 Others. Only within 24h of AckDt (enforced by IRP).
 */
export async function cancelIrn(
  cfg: WhitebooksConfig,
  irn: string,
  reason: string
): Promise<Record<string, unknown>> {
  const body = await postWhitebooks(
    cfg,
    "/einvoice/type/CANCEL/version/V1_03",
    { Irn: irn, CnlRsn: "4", CnlRem: reason.slice(0, 100) },
    "IRN cancellation"
  );
  return (body.data ?? {}) as Record<string, unknown>;
}

export type EwbByIrnParams = {
  irn: string;
  distanceKm: number;
  vehicleNo: string;
  transporterName?: string | null;
  transporterGstin?: string | null;
};

/** Generate an e-way bill against an existing IRN.
 *
 *  KNOWN LIMITATION (staging scope: documented, not expanded): TransMode
 *  is always "1" (road) and VehType always "R" (regular) — rail/air/ship
 *  and over-dimensional cargo have no UI or mapping. Standalone (non-IRN)
 *  e-way bills are likewise out of scope by decision.
 */
export async function generateEwbByIrn(
  cfg: WhitebooksConfig,
  params: EwbByIrnParams
): Promise<IrnSuccessData> {
  const body: Record<string, unknown> = {
    Irn: params.irn,
    Distance: Math.round(params.distanceKm),
    TransMode: "1",
    VehNo: params.vehicleNo.toUpperCase(),
    VehType: "R",
  };
  if (params.transporterGstin) body.TransId = params.transporterGstin;
  if (params.transporterName) body.TransName = params.transporterName;
  const response = await postWhitebooks(
    cfg,
    "/einvoice/type/GENERATE_EWAYBILL/version/V1_03",
    body,
    "E-way bill generation"
  );
  return (response.data ?? {}) as IrnSuccessData;
}

/** Cancel an e-way bill. Only within 24h of generation (enforced by NIC). */
export async function cancelEwb(
  cfg: WhitebooksConfig,
  ewbNo: string,
  reason: string
): Promise<Record<string, unknown>> {
  const response = await postWhitebooks(
    cfg,
    "/ewaybillapi/v1.03/ewayapi/canewb",
    {
      ewbNo: Number(ewbNo),
      cancelRsnCode: "4",
      cancelRmrk: reason.slice(0, 100),
    },
    "E-way bill cancellation"
  );
  return (response.data ?? {}) as Record<string, unknown>;
}

/** Test hook: forget the cached token (process restart does the same). */
export function clearAuthTokenCache(): void {
  cached = null;
}
