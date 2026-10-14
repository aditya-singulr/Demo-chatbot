import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to handle auth redirects.
 *
 * Active when NEXT_PUBLIC_AUTH_MODE is okta, login, or otp-login.
 * start-ui.mjs uses okta-ui: chat stays at `/` and the page redirects to /auth
 * if tokens are missing (tokens live in localStorage, so middleware cannot see them).
 */
export function middleware(request: NextRequest) {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE;
  if (authMode !== "okta" && authMode !== "login" && authMode !== "otp-login") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const dest =
      authMode === "login" ? "/login" : authMode === "otp-login" ? "/otp-login" : "/auth";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
