import { NextRequest } from "next/server";
import { proxyOtpJson } from "@/lib/otp-login-proxy";

export async function GET(request: NextRequest) {
  return proxyOtpJson(request, "/api/auth/check");
}
