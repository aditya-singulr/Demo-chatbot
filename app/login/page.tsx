"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithPassword, useLoginToken } from "@/lib/login-auth";

export default function LoginPage() {
  const router = useRouter();
  const token = useLoginToken();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      router.replace("/login/chat");
    }
  }, [router, token]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const submittedUser = String(form.get("username") ?? "").trim();
    const submittedPassword = String(form.get("password") ?? "");
    if (!submittedUser || !submittedPassword) {
      setError("Username and password are required");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await loginWithPassword(submittedUser, submittedPassword);
      router.replace("/login/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
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
            <p className="text-sm text-gray-500 mt-1">Sign in to chat with Aria</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                onChange={(e) => setUsername(e.target.value)}
                onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                required
                suppressHydrationWarning
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
                onChange={(e) => setPassword(e.target.value)}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                required
                suppressHydrationWarning
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
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* <p className="text-xs text-gray-400 text-center mt-6">
            Default credentials: <span className="font-medium text-gray-500">demo / demo123</span>
          </p> */}
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          <a href="/" className="hover:text-gray-600 underline">
            Use without authentication
          </a>
        </p>
      </div>
    </div>
  );
}
