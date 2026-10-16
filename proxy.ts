import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The authenticated launcher sets AUTHENTICATED_UI_ONLY. In that mode the
 * normal app entrypoint and its backend proxy routes are not exposed.
 */
export function proxy(request: NextRequest) {
  if (
    process.env.AUTHENTICATED_UI_ONLY === "true" &&
    (request.nextUrl.pathname === "/" ||
      request.nextUrl.pathname === "/api/ui" ||
      request.nextUrl.pathname.startsWith("/api/ui/") ||
      request.nextUrl.pathname === "/api/providers" ||
      request.nextUrl.pathname.startsWith("/api/providers/") ||
      request.nextUrl.pathname === "/api/litellm-providers" ||
      request.nextUrl.pathname.startsWith("/api/litellm-providers/"))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/api/ui/:path*",
    "/api/providers/:path*",
    "/api/litellm-providers/:path*",
  ],
};
