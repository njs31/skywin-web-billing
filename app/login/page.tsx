"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendOtp, verifyOtpAndLogin, loginWithPhone } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, CheckCircle2, AlertCircle, LogIn, KeyRound, ArrowLeft, RefreshCw, MessageSquare } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [useDirectLogin, setUseDirectLogin] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setDevOtpHint(null);

    if (!phone.trim() || phone.trim().length < 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }

    startTransition(async () => {
      try {
        if (useDirectLogin) {
          const res = await loginWithPhone(phone);
          if (res.success) {
            setSuccess("Direct login successful! Redirecting...");
            setTimeout(() => {
              router.push("/");
              router.refresh();
            }, 600);
          }
          return;
        }

        const res = await sendOtp(phone);
        if (res.success) {
          setSuccess(res.whatsappSent ? "OTP sent via WhatsApp successfully!" : "OTP generated!");
          if (res.devOtp) {
            setDevOtpHint(res.devOtp);
          }
          setStep("otp");
          setResendTimer(60);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send OTP");
      }
    });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!otp.trim() || otp.trim().length < 6) {
      setError("Please enter the 6-digit OTP code");
      return;
    }

    startTransition(async () => {
      try {
        const res = await verifyOtpAndLogin(phone, otp);
        if (res.success) {
          setSuccess("Verification successful! Redirecting to workspace...");
          setTimeout(() => {
            router.push("/");
            router.refresh();
          }, 600);
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
          setSuccess("New OTP resent via WhatsApp!");
          if (res.devOtp) setDevOtpHint(res.devOtp);
          setResendTimer(60);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resend OTP");
      }
    });
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Decorative gradient backgrounds */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-80 w-80 rounded-full bg-emerald-600/15 blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-80 w-80 rounded-full bg-blue-600/15 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center rounded-2xl bg-emerald-500/10 p-3 ring-1 ring-emerald-500/30 mb-2">
            <MessageSquare className="h-8 w-8 text-emerald-400" />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Skywin Agri Super Market
          </h2>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Secure Role-Based Billing & Management System with WhatsApp Authentication
          </p>
        </div>

        <Card className="border-slate-800/80 bg-slate-900/80 shadow-2xl backdrop-blur-xl ring-1 ring-white/5 transition-all duration-300">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold text-white flex items-center gap-2.5">
                {step === "phone" ? (
                  <>
                    <LogIn className="h-5 w-5 text-emerald-400" />
                    Sign In
                  </>
                ) : (
                  <>
                    <KeyRound className="h-5 w-5 text-emerald-400" />
                    Verify WhatsApp OTP
                  </>
                )}
              </CardTitle>
              {step === "otp" && (
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setError("");
                    setSuccess("");
                  }}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Change Phone
                </button>
              )}
            </div>
            <CardDescription className="text-slate-400 text-xs sm:text-sm">
              {step === "phone"
                ? "Enter your registered mobile number to receive a secure login code via WhatsApp."
                : `We sent a 6-digit code to +91 ${phone} on WhatsApp.`}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-2">
            {step === "phone" ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-slate-300 font-medium">
                    Mobile Number
                  </Label>
                  <div className="relative rounded-lg shadow-inner">
                    <span className="absolute left-3.5 top-3 flex items-center gap-1 text-slate-400 font-medium text-sm border-r border-slate-700 pr-2">
                      +91
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="9999999999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="pl-14 h-11 border-slate-800 bg-slate-950/60 text-white placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-mono text-base transition-all"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>
                      * Enter <span className="font-semibold text-slate-400">9999999999</span> for Admin test access.
                    </span>
                    {process.env.NODE_ENV === "development" && (
                      <button
                        type="button"
                        onClick={() => setUseDirectLogin(!useDirectLogin)}
                        className="text-slate-400 hover:text-emerald-400 underline transition-colors"
                      >
                        {useDirectLogin ? "Use WhatsApp OTP" : "Direct Login Mode"}
                      </button>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-red-950/60 border border-red-900/40 p-3 text-xs text-red-300 animate-in fade-in-50">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-emerald-950/60 border border-emerald-900/40 p-3 text-xs text-emerald-300 animate-in fade-in-50">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{success}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 transition-all duration-200"
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {useDirectLogin ? "Signing in..." : "Sending WhatsApp OTP..."}
                    </span>
                  ) : useDirectLogin ? (
                    "Sign In Directly"
                  ) : (
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Send OTP via WhatsApp
                    </span>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5 animate-in fade-in-50 slide-in-from-right-4 duration-300">
                {devOtpHint && (
                  <div className="rounded-lg bg-emerald-950/80 border border-emerald-500/30 p-3 text-xs text-emerald-300 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>
                        Test OTP Code: <strong className="font-mono text-emerald-200 text-sm">{devOtpHint}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtp(devOtpHint)}
                      className="text-xs bg-emerald-800/80 hover:bg-emerald-700 text-white px-2.5 py-1 rounded font-medium transition-colors"
                    >
                      Auto-fill
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-slate-300 font-medium flex justify-between">
                    <span>One-Time Password (OTP)</span>
                    <span className="text-xs text-slate-500">6 digits</span>
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="• • • • • •"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-14 text-center tracking-[0.5em] text-xl font-mono border-slate-800 bg-slate-950/80 text-emerald-400 placeholder-slate-700 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 shadow-inner rounded-xl"
                    required
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-red-950/60 border border-red-900/40 p-3 text-xs text-red-300">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-emerald-950/60 border border-emerald-900/40 p-3 text-xs text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{success}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isPending || otp.length < 6}
                  className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40 transition-all duration-200"
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Verifying Code...
                    </span>
                  ) : (
                    "Verify & Access Workspace"
                  )}
                </Button>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                  <span className="text-slate-400">Didn&apos;t receive the WhatsApp message?</span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendTimer > 0 || isPending}
                    className={`font-medium transition-colors ${
                      resendTimer > 0
                        ? "text-slate-600 cursor-not-allowed"
                        : "text-emerald-400 hover:text-emerald-300 underline"
                    }`}
                  >
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-slate-500">
          <p>Protected by Skywin Security & Interakt WhatsApp Business API</p>
        </div>
      </div>
    </div>
  );
}
