import { Outfit } from "next/font/google";
import type { ReactNode } from "react";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-login-display",
  display: "swap",
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className={`${outfit.variable} ${outfit.className}`}>{children}</div>;
}
