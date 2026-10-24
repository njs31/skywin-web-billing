import { Outfit } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-login-display",
  display: "swap",
});

export default async function LoginLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim().split(":")[0];
  const fieldSite = host === "skywin-field.qwicksapp.com";
  return (
    <div className={`${outfit.variable} ${outfit.className}`} data-field-site={fieldSite ? "1" : "0"}>
      {children}
    </div>
  );
}
