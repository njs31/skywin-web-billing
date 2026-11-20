import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { canManageField, isSalesManager } from "@/lib/user-roles";
import { FieldShell } from "@/components/field/field-shell";

import { BILLING_ORIGIN, isFieldHost } from "@/lib/site-hosts";

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host") || "";
  const fieldSite = isFieldHost(host);
  if (isSalesManager(user.role)) {
    return (
      <FieldShell teamOnly userName={user.name} billingHref={fieldSite ? BILLING_ORIGIN : "/"}>
        {children}
      </FieldShell>
    );
  }
  if (user.role === "sales_officer") {
    // Field officers use only Recommendations on the field site (the proxy keeps them there).
    return (
      <FieldShell recommendationsOnly userName={user.name} billingHref={fieldSite ? BILLING_ORIGIN : "/"}>
        {children}
      </FieldShell>
    );
  }
  if (!canManageField(user.role)) redirect(fieldSite ? BILLING_ORIGIN : "/");

  return (
    <FieldShell billingHref={fieldSite ? BILLING_ORIGIN : "/"}>
      {children}
    </FieldShell>
  );
}
