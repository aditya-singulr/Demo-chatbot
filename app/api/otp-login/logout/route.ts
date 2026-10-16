import { NextRequest } from "next/server";
import { proxyOtpJson } from "@/lib/otp-login-proxy";

export async function POST(request: NextRequest) {
  return proxyOtpJson(request, "/api/otp-login/logout", { method: "POST" });
}
