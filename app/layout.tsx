import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { BUSINESS } from "@/lib/business";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ICONS: Metadata["icons"] = {
  icon: [
    { url: "/favicon.ico", sizes: "any" },
    { url: "/icon.png", type: "image/png", sizes: "512x512" },
    { url: "/logo.avif", type: "image/avif" },
  ],
  shortcut: "/favicon.ico",
  apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
};

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim().split(":")[0];
  if (host === "skywin-field.qwicksapp.com") {
    return {
      title: "SkyWin Field",
      description: "Field officer workspace for farmers, catalog, officers, and field orders.",
      icons: ICONS,
    };
  }
  return {
    title: `${BUSINESS.name} — ${BUSINESS.tagline}`,
    description: "POS billing software for SKYWIN BIOTECH Agri Super Market",
    icons: ICONS,
  };
}

// POS app always needs the live DB — never prerender pages at build time.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
