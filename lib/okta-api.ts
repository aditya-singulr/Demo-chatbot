import { NextRequest, NextResponse } from "next/server";

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Authentication required", code: "AUTH_REQUIRED" },
    { status: 401 }
  );
}

export function requireOktaBearer(req: NextRequest): string | NextResponse {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ") || authHeader.trim().length < 16) {
    return unauthorized();
  }
  return authHeader;
}
