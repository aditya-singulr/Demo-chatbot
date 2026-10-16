"use client";

import Link from "next/link";

/**
 * OAuth PKCE callback is disabled; Okta login uses username/password on /auth.
 */
export default function CallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-sm text-gray-600 mb-4">
          OAuth callback is not used. Sign in with your Okta username and password.
        </p>
        <Link
          href="/auth"
          className="inline-block bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}
