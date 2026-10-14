"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { handleStandardCallback } from "@/lib/okta-standard";

function StandardCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (errorParam) {
      queueMicrotask(() => setError(errorDescription || errorParam));
      return;
    }

    if (!code || !state) {
      queueMicrotask(() => setError("Missing authorization code or state"));
      return;
    }

    handleStandardCallback(code, state)
      .then(async (tokens) => {
        const sessionResponse = await fetch("/api/standard-auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!sessionResponse.ok) {
          throw new Error("Unable to establish the authenticated session");
        }
        router.replace("/");
      })
      .catch((callbackError) => {
        console.error("Standard Okta callback error:", callbackError);
        setError(
          callbackError instanceof Error
            ? callbackError.message
            : "Authentication failed",
        );
      });
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-2xl mx-auto mb-4">
            ✕
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Authentication Failed
          </h1>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <a
            href="/auth"
            className="inline-block bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors"
          >
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function StandardOktaCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-600">Loading...</div>
        </div>
      }
    >
      <StandardCallbackHandler />
    </Suspense>
  );
}
