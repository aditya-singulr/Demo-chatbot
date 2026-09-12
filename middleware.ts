import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to handle auth redirects.
 *
 * When AUTH_REDIRECT_ENABLED=true, redirects unauthenticated users
 * from root (/) to the login page (/auth).
 */
export function middleware(request: NextRequest) {
  const authRedirectEnabled = process.env.AUTH_REDIRECT_ENABLED === "true";

  if (!authRedirectEnabled) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(
    process.env.NEXT_PUBLIC_OKTA_SESSION_COOKIE_NAME || "okta_session"
  );

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
