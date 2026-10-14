import { NextRequest, NextResponse } from "next/server";
import {
  getStandardSessionAccessToken,
  standardSessionCookieOptions,
  STANDARD_OKTA_SESSION_COOKIE,
  validateStandardOktaAccessToken,
} from "@/lib/okta-standard-session";

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

  const user = await validateStandardOktaAccessToken(accessToken);
  if (!user) return unauthorized();

  const response = NextResponse.json({
    authenticated: true,
    user: {
      user_id: user.sub ?? "",
      email: user.email,
      name: user.name,
    },
  });
  response.cookies.set(
    STANDARD_OKTA_SESSION_COOKIE,
    accessToken,
    standardSessionCookieOptions(),
  );
  return response;
}

export async function GET(request: NextRequest) {
  const accessToken = getStandardSessionAccessToken(request);
  if (!accessToken) return unauthorized();

  const user = await validateStandardOktaAccessToken(accessToken);
  if (!user) {
    const response = unauthorized();
    response.cookies.delete(STANDARD_OKTA_SESSION_COOKIE);
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
  response.cookies.set(STANDARD_OKTA_SESSION_COOKIE, "", {
    ...standardSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
