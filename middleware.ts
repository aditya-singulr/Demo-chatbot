import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to handle auth redirects.
 *
 * Only active when NEXT_PUBLIC_AUTH_MODE=okta (set by start-ui-auth.mjs).
 * For the standard UI (start-ui.mjs), this middleware does nothing.
 */
export function middleware(request: NextRequest) {
  // Only redirect to /auth when auth mode is enabled
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE;
  if (authMode !== "okta") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Redirect root to /auth for the authenticated experience
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
