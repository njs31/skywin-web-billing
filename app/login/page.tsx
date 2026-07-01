"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginWithPhone } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, CheckCircle2, AlertCircle, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!phone.trim() || phone.trim().length < 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    startTransition(async () => {
      try {
        const res = await loginWithPhone(phone);
        if (res.success) {
          setSuccess("Login successful! Redirecting...");
          setTimeout(() => {
            router.push("/");
            router.refresh();
          }, 600);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to sign in");
      }
    });
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-12 sm:px-6 lg:px-8">
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
            <CardTitle className="text-xl text-white flex items-center gap-2">
              <LogIn className="h-5 w-5 text-emerald-400" />
              Sign In
            </CardTitle>
            <CardDescription className="text-slate-400">
              Enter your registered mobile number to access your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
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

              {success && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-950/50 border border-emerald-900/30 p-3 text-xs text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                {isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
