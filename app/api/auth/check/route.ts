import { NextRequest, NextResponse } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth-proxy";

export async function GET(req: NextRequest) {
  const response = await proxyAuthenticatedJson(req, "/api/auth/check");
  if (!response.ok) return NextResponse.json({ authenticated: false });
  return response;

}
