import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getSessionAccessToken,
  OKTA_SESSION_COOKIE,
  validateOktaAccessToken,
} from "@/lib/okta-session";

/**
 * Middleware to handle auth redirects.
 *
 * The standard UI uses a server-validated Okta session. The other auth modes
 * retain their existing root redirect behavior.
 */
export async function middleware(request: NextRequest) {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE;

  if (authMode === "okta-standard") {
    const { pathname } = request.nextUrl;
    const isPublicPath =
      pathname === "/auth" ||
      pathname === "/auth/callback" ||
      pathname === "/api/auth/session";

    if (isPublicPath) {
      return NextResponse.next();
    }

    const accessToken = getSessionAccessToken(request);
    if (accessToken && (await validateOktaAccessToken(accessToken))) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
      response.cookies.delete(OKTA_SESSION_COOKIE);
      return response;
    }

    const response = NextResponse.redirect(new URL("/auth", request.url));
    response.cookies.delete(OKTA_SESSION_COOKIE);
    return response;
  }

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
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
