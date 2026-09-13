import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to handle auth redirects.
 *
 * For OAuth flow, tokens are stored in localStorage (client-side only).
 * This middleware just redirects root (/) to /auth when Okta is configured.
 * Client-side pages handle the actual token validation.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect root to /auth for the authenticated experience
  // The login page will redirect to /auth/chat if already authenticated
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
