/**
 * WhiteBooks (GSP) connection details.
 *
 * Everything comes from the environment, never the settings table — the
 * IRP password in particular must not sit in a DB row the admin UI
 * displays. Production values live in `.env.production` on the VPS;
 * see `.env.example` for the full variable list.
 */
export type WhitebooksEnv = "sandbox" | "production";

export type WhitebooksConfig = {
  env: WhitebooksEnv;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** The `API_…` user created through GSP on the e-invoice portal. */
  gstUsername: string;
  gstPassword: string;
  gstin: string;
  /** WhiteBooks login email — required `?email=` query on every call. */
  email: string;
  /** Public egress IP of the calling server, forwarded to the IRP. */
  ipAddress: string;
};

export function getWhitebooksConfig(): WhitebooksConfig {
  const env: WhitebooksEnv =
    process.env.WHITEBOOKS_ENV === "production" ? "production" : "sandbox";
  return {
    env,
    baseUrl:
      env === "production"
        ? "https://api.whitebooks.in"
        : "https://apisandbox.whitebooks.in",
    clientId: process.env.WHITEBOOKS_CLIENT_ID ?? "",
    clientSecret: process.env.WHITEBOOKS_CLIENT_SECRET ?? "",
    gstUsername: process.env.WHITEBOOKS_GST_USERNAME ?? "",
    gstPassword: process.env.WHITEBOOKS_GST_PASSWORD ?? "",
    gstin: process.env.WHITEBOOKS_GSTIN ?? "",
    email: process.env.WHITEBOOKS_EMAIL ?? "",
    ipAddress: process.env.WHITEBOOKS_IP_ADDRESS ?? "",
  };
}

/** Fail closed with a message that names the missing variable. */
export function assertWhitebooksConfigured(cfg: WhitebooksConfig): void {
  const missing: string[] = [];
  if (!cfg.clientId) missing.push("WHITEBOOKS_CLIENT_ID");
  if (!cfg.clientSecret) missing.push("WHITEBOOKS_CLIENT_SECRET");
  if (!cfg.gstUsername) missing.push("WHITEBOOKS_GST_USERNAME");
  if (!cfg.gstPassword) missing.push("WHITEBOOKS_GST_PASSWORD");
  if (!cfg.gstin) missing.push("WHITEBOOKS_GSTIN");
  if (!cfg.email) missing.push("WHITEBOOKS_EMAIL");
  if (!cfg.ipAddress) missing.push("WHITEBOOKS_IP_ADDRESS");
  if (missing.length > 0) {
    throw new Error(
      `WhiteBooks is not configured (missing ${missing.join(", ")}). ` +
        "Nothing was sent anywhere."
    );
  }
}
