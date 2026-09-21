"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initiateLogin, hasValidTokens } from "@/lib/okta";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    if (hasValidTokens()) {
      router.replace("/auth/chat");
    } else {
      setCheckingSession(false);
    }
  }, [router]);

  async function handleLogin() {
    setLoading(true);
    try {
      await initiateLogin();
      // This will redirect to Okta, so we won't reach here
    } catch (err) {
      console.error("Login initiation error:", err);
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Checking session...</div>
      </div>
    );
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

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium text-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Redirecting to Okta...
              </span>
            ) : (
              "Sign in with Okta"
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-6">
            Secured by Okta SSO
          </p>
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
