import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { isShippingAllowedPhone, isShippingHost } from "@/lib/shipping-access";
import { ShippingShell } from "@/components/shipping/shipping-shell";
import { getShippingProvider } from "@/lib/delivery/manual-rates";
import { BILLING_ORIGIN } from "@/lib/site-hosts";

export const dynamic = "force-dynamic";

export default async function ShippingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const hostHeader = (await headers()).get("x-forwarded-host") || (await headers()).get("host") || "";
  const host = hostHeader.split(",")[0].trim().split(":")[0].toLowerCase();
  const isShippingSubdomain = isShippingHost(host);

  // Only the allowlisted numbers may use Shipping, on any host. Other signed-in users go back to
  // the shipping sign-in page with a message (or to billing's home on the billing site).
  if (!isShippingAllowedPhone(user.phone)) {
    redirect(isShippingSubdomain || isShippingHost(hostHeader) ? "/login?denied=shipping" : "/");
  }

  const currentProvider = await getShippingProvider();

  return (
    <ShippingShell
      initialProvider={currentProvider}
      billingHref={isShippingSubdomain ? BILLING_ORIGIN : "/"}
    >
      {children}
    </ShippingShell>
  );
}
