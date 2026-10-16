import { NextRequest } from "next/server";
import { proxyAuthenticatedChat } from "@/lib/auth-proxy";

export async function POST(request: NextRequest) {
  return proxyAuthenticatedChat(request, "/api/otp-login/ui");
}
