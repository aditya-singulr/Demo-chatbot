import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * `/` is never the chat UI. Redirect to the login for this process.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/") {
    return NextResponse.next();
  }

  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE;
  const dest =
    authMode === "login" ? "/login" : authMode === "otp-login" ? "/otp-login" : "/auth";
  return NextResponse.redirect(new URL(dest, request.url));
}

export const config = {
  matcher: ["/"],
};
