import { NextRequest } from "next/server";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import {
  cleanMobile,
  clientIp,
  createOtpChallenge,
  isValidMobile,
  newOtpCode,
  rateLimited,
  reviewLogin,
  type FieldRole,
} from "@/lib/field-auth";
import { fieldStaffForLogin } from "@/lib/field-staff";
import { sendWhatsAppOtp } from "@/lib/services/interakt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

/**
 * Step 1 of field app sign-in. Sends a WhatsApp code and returns a challenge the app
 * sends back with the code. No app key needed: this is how a phone gets one.
 */
export async function POST(req: NextRequest) {
  let body: { phone?: string; as?: string };
  try {
    body = await req.json();
  } catch {
    return fieldJson({ error: "Invalid request" }, 400);
  }
  const phone = cleanMobile(body.phone);
  const role: FieldRole = body.as === "manager" ? "manager" : body.as === "officer" ? "officer" : "farmer";
  if (!isValidMobile(phone)) {
    return fieldJson({ error: "Wrong number. Please enter the number correctly again." }, 400);
  }
  if (rateLimited(`otp-send:${phone}`, 4, 10 * 60 * 1000) || rateLimited(`otp-send-ip:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
    return fieldJson({ error: "Too many codes requested. Wait 10 minutes and try again." }, 429);
  }

  if (role !== "farmer") {
    const staff = await fieldStaffForLogin(phone, role);
    const review = reviewLogin(phone, role);
    if (!staff && !review) {
      return fieldJson({ error: "not_registered", allowed: false }, 403);
    }
  }

  const review = reviewLogin(phone, role);
  if (review) {
    return fieldJson({ challenge: createOtpChallenge(phone, role, review), phone });
  }

  const code = newOtpCode();
  const sent = await sendWhatsAppOtp(phone, code);
  if (!sent.success) {
    return fieldJson({ error: sent.error || "WhatsApp could not send the code. Try again." }, 502);
  }
  return fieldJson({ challenge: createOtpChallenge(phone, role, code), phone });
}
