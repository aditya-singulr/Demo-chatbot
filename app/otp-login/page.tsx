"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  loginWithOtpCredentials,
  verifyOtp,
  type OtpLoginUser,
} from "@/lib/otp-login-auth";

type LoginStep = "credentials" | "otp";

export default function OtpLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingUser, setPendingUser] = useState<OtpLoginUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/otp-login/check", { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        if (data.authenticated) router.replace("/otp-login/chat");
      })
      .catch(() => {});
  }, [router]);

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Username and password are required");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const user = await loginWithOtpCredentials(username.trim(), password);
      setPendingUser(user);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otp.trim()) {
      setError("OTP is required");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await verifyOtp(pendingUser?.username ?? username.trim(), otp.trim());
      router.replace("/otp-login/chat?welcome=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
      setLoading(false);
    }
  }

  function returnToCredentials() {
    setStep("credentials");
    setPendingUser(null);
    setOtp("");
    setError(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
              N
            </div>
            <h1 className="text-xl font-semibold text-gray-900">NovaPay Support</h1>
            <p className="text-sm text-gray-500 mt-1">
              {step === "credentials"
                ? "Sign in to chat with Aria"
                : "Enter the one-time password to continue"}
            </p>
          </div>

          {step === "credentials" ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-xs font-medium text-gray-600 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs font-medium text-gray-600 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                />
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Checking credentials..." : "Continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div>
                <label htmlFor="otp" className="block text-xs font-medium text-gray-600 mb-1">
                  One-time password
                </label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm tracking-[0.3em] text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                />
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          <Link href="/" className="hover:text-gray-600 underline">
            Use without authentication
          </Link>
        </p>
      </div>
    </div>
  );
}
