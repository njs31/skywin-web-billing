"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  sendOtp,
  verifyOtpAndLogin,
  loginWithPhone,
  loginWithAdminPassword,
} from "@/lib/actions/auth";
import { BUSINESS } from "@/lib/business";
import { AlertCircle, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";

const ADMIN_PHONE = "9999999999";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<"phone" | "otp" | "password">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [useDirectLogin, setUseDirectLogin] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setDevOtpHint(null);

    if (!phone.trim() || phone.trim().length < 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }

    if (phone === ADMIN_PHONE) {
      setStep("password");
      setPassword("");
      return;
    }

    startTransition(async () => {
      try {
        if (useDirectLogin) {
          const res = await loginWithPhone(phone);
          if (res.success) {
            setSuccess("Signed in. Opening workspace…");
            setTimeout(() => {
              router.push("/");
              router.refresh();
            }, 500);
          } else {
            setError(res.error || "Login failed");
          }
          return;
        }

        const res = await sendOtp(phone);
        if (res.success) {
          setSuccess(res.whatsappSent ? "OTP sent on WhatsApp" : "OTP generated");
          if (res.devOtp) setDevOtpHint(res.devOtp);
          setStep("otp");
          setResendTimer(60);
        } else {
          setError(res.error || "Failed to send OTP");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send OTP");
      }
    });
  };

  const handleAdminPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!password) {
      setError("Enter the admin password");
      return;
    }

    startTransition(async () => {
      try {
        const res = await loginWithAdminPassword(phone, password);
        if (res.success) {
          setSuccess("Signed in. Opening workspace…");
          setTimeout(() => {
            router.push("/");
            router.refresh();
          }, 500);
        } else {
          setError(res.error || "Invalid password");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!otp.trim() || otp.trim().length < 6) {
      setError("Enter the 6-digit OTP");
      return;
    }

    startTransition(async () => {
      try {
        const res = await verifyOtpAndLogin(phone, otp);
        if (res.success) {
          setSuccess("Verified. Opening workspace…");
          setTimeout(() => {
            router.push("/");
            router.refresh();
          }, 500);
        } else {
          setError(res.error || "Verification failed");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed");
      }
    });
  };

  const handleResendOtp = () => {
    if (resendTimer > 0 || isPending) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        const res = await sendOtp(phone);
        if (res.success) {
          setSuccess("OTP resent on WhatsApp");
          if (res.devOtp) setDevOtpHint(res.devOtp);
          setResendTimer(60);
        } else {
          setError(res.error || "Failed to resend OTP");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resend OTP");
      }
    });
  };

  const goBackToPhone = () => {
    setStep("phone");
    setError("");
    setSuccess("");
    setPassword("");
    setOtp("");
  };

  const stepTitle =
    step === "phone"
      ? "Sign in"
      : step === "password"
        ? "Admin password"
        : "Enter OTP";

  const stepHint =
    step === "phone"
      ? "Use your registered mobile number. We’ll send a WhatsApp code."
      : step === "password"
        ? "Enter the admin password for this workspace."
        : `Code sent to +91 ${phone}`;

  const submitLabel =
    isPending
      ? step === "password"
        ? "Signing in…"
        : step === "otp"
          ? "Verifying…"
          : useDirectLogin
            ? "Signing in…"
            : "Sending…"
      : step === "password"
        ? "Sign in"
        : step === "otp"
          ? "Verify & continue"
          : phone === ADMIN_PHONE
            ? "Continue"
            : useDirectLogin
              ? "Sign in"
              : "Send WhatsApp OTP";

  return (
    <div className="login-screen relative min-h-screen overflow-hidden bg-[#050605] text-[#f4f7ea]">
      {/* Brand atmosphere — lime leaf wash from logo palette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 55% at 12% 18%, rgba(176, 209, 42, 0.16), transparent 55%),
            radial-gradient(ellipse 70% 50% at 88% 82%, rgba(64, 96, 32, 0.35), transparent 50%),
            linear-gradient(160deg, #050605 0%, #0a1008 48%, #050605 100%)
          `,
        }}
      />
      <div
        aria-hidden
        className="login-grid pointer-events-none absolute inset-0 opacity-[0.22]"
      />

      <div
        className={`relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12 transition-all duration-700 ease-out sm:px-8 ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        {/* Brand hero */}
        <div className="mb-10 flex flex-col items-center text-center">
          <div
            className={`login-logo-glow mb-6 transition-transform duration-700 ease-out ${
              mounted ? "scale-100" : "scale-90"
            }`}
          >
            <Image
              src="/logo.avif"
              alt={BUSINESS.name}
              width={112}
              height={112}
              priority
              className="h-24 w-24 sm:h-28 sm:w-28"
            />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#b4d12a]">
            {BUSINESS.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#f4f7ea] sm:text-4xl">
            {BUSINESS.tagline}
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#9aa88a]">
            Billing workspace for your store.
          </p>
        </div>

        {/* Auth panel — interaction container, not a flashy card */}
        <div className="border-t border-[#b4d12a]/25 pt-8">
          <div className="mb-6 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#f4f7ea]">
                {stepTitle}
              </h2>
              <p className="mt-1 text-sm text-[#8f9c7e]">{stepHint}</p>
            </div>
            {step !== "phone" && (
              <button
                type="button"
                onClick={goBackToPhone}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-[#9aa88a] transition-colors hover:text-[#b4d12a]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
          </div>

          {step === "phone" && (
            <form onSubmit={handlePhoneSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="phone" className="text-xs font-medium uppercase tracking-wider text-[#9aa88a]">
                  Mobile number
                </label>
                <div className="flex items-stretch overflow-hidden rounded-md border border-[#2a3524] bg-[#0c110d] transition focus-within:border-[#b4d12a]/70">
                  <span className="flex items-center border-r border-[#2a3524] px-3 text-sm text-[#8f9c7e]">
                    +91
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="10-digit number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="h-12 w-full bg-transparent px-3 font-mono text-base text-[#f4f7ea] outline-none placeholder:text-[#4a5540]"
                    required
                    autoFocus
                  />
                </div>
                {process.env.NODE_ENV === "development" && (
                  <button
                    type="button"
                    onClick={() => setUseDirectLogin(!useDirectLogin)}
                    className="text-[11px] text-[#6e7a60] underline-offset-2 hover:text-[#b4d12a] hover:underline"
                  >
                    {useDirectLogin ? "Use WhatsApp OTP" : "Dev: direct login"}
                  </button>
                )}
              </div>

              <StatusMessage error={error} success={success} />

              <button
                type="submit"
                disabled={isPending}
                className="login-cta group relative w-full overflow-hidden rounded-md bg-[#b4d12a] px-4 py-3 text-sm font-semibold tracking-wide text-[#0a1008] transition hover:bg-[#c4e038] disabled:opacity-60"
              >
                <span className="relative z-10 inline-flex items-center justify-center gap-2">
                  {isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {submitLabel}
                </span>
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={handleAdminPassword} className="login-step space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-xs font-medium uppercase tracking-wider text-[#9aa88a]"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-md border border-[#2a3524] bg-[#0c110d] px-3 font-mono text-base text-[#f4f7ea] outline-none transition placeholder:text-[#4a5540] focus:border-[#b4d12a]/70"
                  required
                  autoFocus
                />
              </div>

              <StatusMessage error={error} success={success} />

              <button
                type="submit"
                disabled={isPending || !password}
                className="login-cta w-full rounded-md bg-[#b4d12a] px-4 py-3 text-sm font-semibold tracking-wide text-[#0a1008] transition hover:bg-[#c4e038] disabled:opacity-60"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {submitLabel}
                </span>
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="login-step space-y-5">
              {devOtpHint && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-[#b4d12a]/30 bg-[#b4d12a]/10 px-3 py-2 text-xs text-[#d4e88a]">
                  <span>
                    Dev OTP: <strong className="font-mono text-sm">{devOtpHint}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOtp(devOtpHint)}
                    className="font-medium text-[#b4d12a] hover:underline"
                  >
                    Fill
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="otp" className="text-xs font-medium uppercase tracking-wider text-[#9aa88a]">
                  6-digit OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-14 w-full rounded-md border border-[#2a3524] bg-[#0c110d] text-center font-mono text-2xl tracking-[0.4em] text-[#b4d12a] outline-none transition placeholder:tracking-[0.4em] placeholder:text-[#4a5540] focus:border-[#b4d12a]/70"
                  required
                  autoFocus
                />
              </div>

              <StatusMessage error={error} success={success} />

              <button
                type="submit"
                disabled={isPending || otp.length < 6}
                className="login-cta w-full rounded-md bg-[#b4d12a] px-4 py-3 text-sm font-semibold tracking-wide text-[#0a1008] transition hover:bg-[#c4e038] disabled:opacity-60"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {submitLabel}
                </span>
              </button>

              <div className="flex items-center justify-between pt-1 text-xs text-[#6e7a60]">
                <span>Didn’t get it?</span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendTimer > 0 || isPending}
                  className={
                    resendTimer > 0
                      ? "cursor-not-allowed text-[#4a5540]"
                      : "font-medium text-[#b4d12a] hover:underline"
                  }
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-10 text-center text-[11px] tracking-wide text-[#4a5540]">
          {BUSINESS.website.replace(/^WWW\./i, "").toLowerCase()}
        </p>
      </div>
    </div>
  );
}

function StatusMessage({ error, success }: { error: string; success: string }) {
  if (!error && !success) return null;
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2.5 text-xs text-red-200">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-[#b4d12a]/30 bg-[#b4d12a]/10 px-3 py-2.5 text-xs text-[#d4e88a]">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b4d12a]" />
      <span>{success}</span>
    </div>
  );
}
