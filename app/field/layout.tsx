import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { canManageField } from "@/lib/user-roles";
import { FieldShell } from "@/components/field/field-shell";

const FIELD_HOST = "skywin-field.qwicksapp.com";
const BILLING_ORIGIN = "https://skywin.qwicksapp.com";

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host") || "";
  const fieldSite = host.split(",")[0].trim().split(":")[0].toLowerCase() === FIELD_HOST;
  if (!canManageField(user.role)) redirect(fieldSite ? BILLING_ORIGIN : "/");

  return (
    <FieldShell billingHref={fieldSite ? BILLING_ORIGIN : "/"}>
      {children}
    </FieldShell>
  );
}
