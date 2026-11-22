import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Noto_Sans_Tamil } from "next/font/google";
import { getCurrentUser } from "@/lib/actions/auth";
import { canManageField, isSalesManager } from "@/lib/user-roles";
import { FieldShell } from "@/components/field/field-shell";
import { FieldLangProvider } from "@/components/field/lang";
import { getFieldLang } from "@/lib/field-lang";
import { BILLING_ORIGIN, isFieldHost } from "@/lib/site-hosts";

// Geist has no Tamil letters; this font covers them so Tamil looks crisp and even.
const tamil = Noto_Sans_Tamil({ subsets: ["tamil"], weight: ["400", "500", "600", "700"], variable: "--font-tamil", display: "swap" });

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host") || "";
  const fieldSite = isFieldHost(host);
  const lang = await getFieldLang();
  const billingHref = fieldSite ? BILLING_ORIGIN : "/";

  let mode: "admin" | "team" | "officer" = "admin";
  if (isSalesManager(user.role)) mode = "team";
  else if (user.role === "sales_officer") mode = "officer"; // the proxy keeps officers on Recommendations
  else if (!canManageField(user.role)) redirect(fieldSite ? BILLING_ORIGIN : "/");

  return (
    <div lang={lang} className={`field-ui h-full ${tamil.variable}`}>
      <FieldLangProvider lang={lang}>
        <FieldShell
          teamOnly={mode === "team"}
          recommendationsOnly={mode === "officer"}
          userName={user.name}
          billingHref={billingHref}
        >
          {children}
        </FieldShell>
      </FieldLangProvider>
    </div>
  );
}
