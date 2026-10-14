import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side Okta access-token validation for API routes.
 *
 * When NEXT_PUBLIC_AUTH_MODE is "okta", every protected route must present a
 * valid Bearer token.  Validation is done by calling Okta's /oauth2/v1/userinfo
 * endpoint, the same method used by main_auth.py.
 *
 * Returns `null` when the request is authorised (or auth mode is not active),
 * otherwise returns a 401 NextResponse that the caller should return immediately.
 */
export async function requireAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "okta") {
    return null;
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);
  const oktaDomain =
    process.env.OKTA_DOMAIN ||
    process.env.NEXT_PUBLIC_OKTA_DOMAIN ||
    "singulr.okta.com";

  try {
    const res = await fetch(`https://${oktaDomain}/oauth2/v1/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Invalid or expired token", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    return null;
  } catch {
    return NextResponse.json(
      { error: "Authentication validation failed", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }
}
