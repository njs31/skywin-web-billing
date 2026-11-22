"use client";

import { logout } from "@/lib/actions/auth";
import { BILLING_ORIGIN, isFieldHost, isShippingHost } from "@/lib/site-hosts";

/**
 * Sign out. On the field or shipping site this also ends the billing session, otherwise
 * single sign-on would sign the browser straight back in on the next visit.
 */
export async function signOutEverywhere() {
  await logout();
  const host = window.location.hostname;
  if (isFieldHost(host) || isShippingHost(host)) {
    const back = `${window.location.origin}/login?sso=0`;
    window.location.href = `${BILLING_ORIGIN}/api/sso/logout?to=${encodeURIComponent(back)}`;
    return;
  }
  window.location.href = "/login";
}
