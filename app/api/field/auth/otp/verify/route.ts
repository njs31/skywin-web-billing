import { NextRequest } from "next/server";
import { fieldJson, fieldOptions } from "@/lib/field-cors";
import {
  checkOtpChallenge,
  cleanMobile,
  clientIp,
  createFieldToken,
  rateLimited,
  reviewLogin,
  type FieldRole,
} from "@/lib/field-auth";
import { fieldStaffForLogin } from "@/lib/field-staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return fieldOptions();
}

/** Step 2 of field app sign-in. Checks the code and returns a 30-day login token. */
export async function POST(req: NextRequest) {
  let body: { phone?: string; as?: string; code?: string; challenge?: string };
  try {
    body = await req.json();
  } catch {
    return fieldJson({ error: "Invalid request" }, 400);
  }
  const phone = cleanMobile(body.phone);
  const role: FieldRole = body.as === "manager" ? "manager" : body.as === "officer" ? "officer" : "farmer";
  if (rateLimited(`otp-verify:${phone}`, 8, 10 * 60 * 1000) || rateLimited(`otp-verify-ip:${clientIp(req)}`, 40, 10 * 60 * 1000)) {
    return fieldJson({ error: "Too many tries. Wait 10 minutes and request a new code." }, 429);
  }

  const check = checkOtpChallenge(String(body.challenge || ""), { phone, role, code: String(body.code || "") });
  if (!check.ok) {
    const error =
      check.error === "expired"
        ? "This code has expired. Tap Resend for a new one."
        : "Wrong code. Check WhatsApp and try again.";
    return fieldJson({ error }, 401);
  }

  let officer: { id: number; name: string; role: string } | null = null;
  if (role !== "farmer") {
    officer = await fieldStaffForLogin(phone, role);
    if (!officer && !reviewLogin(phone, role)) {
      return fieldJson({ error: "not_registered" }, 403);
    }
  }

  const token = createFieldToken({ phone, role, officerId: officer?.id });
  return fieldJson({ token, phone, role, officer });
}
