import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getStandardSessionAccessToken,
  STANDARD_OKTA_SESSION_COOKIE,
  validateStandardOktaAccessToken,
} from "@/lib/okta-standard-session";

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

    if (pathname === "/auth") {
      return NextResponse.rewrite(new URL("/standard-auth", request.url));
    }
    if (pathname === "/auth/callback") {
      return NextResponse.rewrite(
        new URL("/standard-auth/callback", request.url),
      );
    }
    if (pathname === "/auth/chat") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const isPublicPath =
      pathname === "/standard-auth" ||
      pathname === "/standard-auth/callback" ||
      pathname === "/api/standard-auth/session";

    if (isPublicPath) {
      return NextResponse.next();
    }

    const accessToken = getStandardSessionAccessToken(request);
    if (
      accessToken &&
      (await validateStandardOktaAccessToken(accessToken))
    ) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
      response.cookies.delete(STANDARD_OKTA_SESSION_COOKIE);
      return response;
    }

    const response = NextResponse.redirect(new URL("/auth", request.url));
    response.cookies.delete(STANDARD_OKTA_SESSION_COOKIE);
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
