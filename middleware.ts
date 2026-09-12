import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to handle auth redirects.
 *
 * When NEXT_PUBLIC_OKTA_DOMAIN is set, redirects users from root (/)
 * to the auth flow (/auth or /auth/chat based on session).
 */
export function middleware(request: NextRequest) {
  // Check if Okta is configured
  const oktaDomain = process.env.NEXT_PUBLIC_OKTA_DOMAIN || "singulr.okta.com";

  const { pathname } = request.nextUrl;
  const cookieName = process.env.NEXT_PUBLIC_OKTA_SESSION_COOKIE_NAME || "sid";
  const sessionCookie = request.cookies.get(cookieName);

  // If accessing root without session, redirect to /auth
  if (pathname === "/" && !sessionCookie) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  // If accessing root with session, redirect to /auth/chat
  if (pathname === "/" && sessionCookie) {
    return NextResponse.redirect(new URL("/auth/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
