import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware to handle auth redirects.
 *
 * Only active when NEXT_PUBLIC_AUTH_MODE is set (okta or login).
 * For the standard UI (start-ui.mjs), this middleware does nothing.
 */
export function middleware(request: NextRequest) {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE;
  if (authMode !== "okta" && authMode !== "login") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const dest = authMode === "login" ? "/login" : "/auth";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
