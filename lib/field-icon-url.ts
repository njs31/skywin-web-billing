import { BILLING_HOST, FIELD_HOSTS, SHIPPING_HOSTS } from "@/lib/site-hosts";

/** Icons must be images uploaded through the dashboard (/api/field/media/…). */
export function cleanIconUri(uri: string | null, env: string | undefined = process.env.NODE_ENV) {
  if (uri == null || uri === "") return null;
  let url: URL;
  try {
    url = new URL(String(uri).trim());
  } catch {
    throw new Error("Upload the icon from this page.");
  }
  const ours = [BILLING_HOST, ...FIELD_HOSTS, ...SHIPPING_HOSTS] as string[];
  const local = url.hostname === "localhost" && env !== "production";
  const hostOk = (url.protocol === "https:" && ours.includes(url.hostname)) || local;
  if (!hostOk || !/^\/api\/field\/media\/[0-9a-f-]{36}$/i.test(url.pathname) || url.search || url.hash) {
    throw new Error("Upload the icon from this page.");
  }
  return url.toString();
}
