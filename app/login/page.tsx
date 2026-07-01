"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendOtp, verifyOtp } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Lock, CheckCircle2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mockOtp, setMockOtp] = useState<string | null>(null);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!phone.trim() || phone.trim().length < 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    startTransition(async () => {
      try {
        const res = await sendOtp(phone);
        if (res.success) {
          setMockOtp(res.mockOtp || null);
          setSuccess("OTP sent successfully. Verify to log in.");
          setStep(2);
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

    if (!otp.trim() || otp.trim().length !== 6) {
      setError("Please enter the 6-digit OTP code");
      return;
    }

    startTransition(async () => {
      try {
        const res = await verifyOtp(phone, otp);
        if (res.success) {
          setSuccess("Login successful! Redirecting...");
          // Wait a split second to show success and redirect
          setTimeout(() => {
            router.push("/");
            router.refresh();
          }, 800);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid OTP");
      }
    });
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-12 sm:px-6 lg:px-8">
      {/* Mock SMS Banner */}
      {mockOtp && (
        <div className="fixed top-4 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4 transition-all duration-300 animate-bounce">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-slate-800/90 p-4 shadow-2xl backdrop-blur-md">
            <Smartphone className="h-6 w-6 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mock SMS Gateway</p>
              <p className="text-sm font-medium text-slate-100 mt-0.5">
                OTP code for <span className="font-semibold text-emerald-400">{phone}</span> is:{" "}
                <span className="rounded bg-emerald-950 px-2 py-0.5 font-bold text-emerald-400 text-base tracking-widest">{mockOtp}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Decorative gradient backgrounds */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-72 w-72 rounded-full bg-emerald-600/10 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Skywin Agri Super Market
          </h2>
          <p className="mt-2.5 text-sm text-slate-400">
            Secure Role-Based Billing & Management System
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-950/80 shadow-xl backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-xl text-white">
              {step === 1 ? "Sign In" : "Verify OTP"}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {step === 1
                ? "Enter your registered mobile number to receive a verification OTP."
                : `Enter the 6-digit OTP code sent to ${phone}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-slate-300">Mobile Number</Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="e.g. 9999999999"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="pl-10 border-slate-800 bg-slate-900 text-white placeholder-slate-500 focus:ring-emerald-500"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    * For first time setup, enter phone <span className="font-semibold text-slate-400">9999999999</span> to auto-seed Admin user.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-900/30 p-3 text-xs text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPending ? "Sending OTP..." : "Send Verification OTP"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-slate-300">OTP Code</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
                    <Input
                      id="otp"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="pl-10 border-slate-800 bg-slate-900 text-white placeholder-slate-500 tracking-widest text-center font-bold text-lg focus:ring-emerald-500"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-900/30 p-3 text-xs text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-950/50 border border-emerald-900/30 p-3 text-xs text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{success}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  >
                    {isPending ? "Verifying..." : "Verify & Sign In"}
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setOtp("");
                      setError("");
                      setSuccess("");
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    Back to phone entry
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
