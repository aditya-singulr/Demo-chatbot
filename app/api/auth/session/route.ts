import { NextRequest, NextResponse } from "next/server";
import {
  getSessionAccessToken,
  OKTA_SESSION_COOKIE,
  sessionCookieOptions,
  validateOktaAccessToken,
} from "@/lib/okta-session";

function unauthorized() {
  return NextResponse.json(
    { error: "Authentication required", code: "AUTH_REQUIRED" },
    { status: 401 },
  );
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) return unauthorized();

  const user = await validateOktaAccessToken(accessToken);
  if (!user) return unauthorized();

  const response = NextResponse.json({
    authenticated: true,
    user: {
      user_id: user.sub ?? "",
      email: user.email,
      name: user.name,
    },
  });
  response.cookies.set(OKTA_SESSION_COOKIE, accessToken, sessionCookieOptions());
  return response;
}

export async function GET(request: NextRequest) {
  const accessToken = getSessionAccessToken(request);
  if (!accessToken) return unauthorized();

  const user = await validateOktaAccessToken(accessToken);
  if (!user) {
    const response = unauthorized();
    response.cookies.delete(OKTA_SESSION_COOKIE);
    return response;
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      user_id: user.sub ?? "",
      email: user.email,
      name: user.name,
    },
  });
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(OKTA_SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
