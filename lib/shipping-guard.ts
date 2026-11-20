import { getCurrentUser } from "@/lib/actions/auth";
import { isShippingAllowedPhone } from "@/lib/shipping-access";

/** The signed-in user if their phone is on the shipping allowlist; otherwise null. */
export async function currentShippingUser() {
  const user = await getCurrentUser();
  if (!user || !isShippingAllowedPhone(user.phone)) return null;
  return user;
}
